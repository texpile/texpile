// one view's document model: blocks, their elements, layouts, heights and counters, laid out on demand (5.6, 5.7)
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { FrameDecorations } from '../contracts/decorationTypes';
import type { BlockLayoutRequest, CanvasEngine, DocumentModel, ModelBlock, ViewBreaking, ViewStyles } from '../contracts/engineTypes';
import type { FaceSettings } from '../contracts/faceTypes';
import type { FaceInputKey } from '../contracts/invalidationTypes';
import type { BlockLayout, DocRect, LayoutBox } from '../contracts/layoutTypes';
import type { VisualView } from '../contracts/viewTypes';
import { collectDecorations } from '../decorations/collectDecorations';
import { decorationSignature } from '../decorations/decorationSignature';
import { BlockFailures, unusableSize } from '../frame/blockFailures';
import { faceElement, provideFaceRects, type FaceElement } from '../tree/faceElement';
import { inlineHitLevels, inlineHitRange } from '../tree/inlineHitChain';
import { rectUnion } from '../geometry/rangeRects';
import type { BlockElements, BlockPositions } from './blockElements';
import { BlockHeights, type BlockMeasure } from './blockHeights';
import type { BlockIndex, IndexChange, IndexedBlock } from './blockIndex';
import type { ModelCounters } from './documentCounters';
import { BlockEstimates } from './estimates';
import { isLayoutEpoch, readersOf } from './invalidation';
import { LayoutCache, type LayoutKey } from './layoutCache';

export type ViewDocumentHost = {
	readonly view: VisualView;
	readonly engine: CanvasEngine;
	readonly styles: ViewStyles;
	readonly index: BlockIndex;
	/** the faces read them while the model is still being made, so the view makes them first */
	readonly counters: ModelCounters;
	readonly elements: BlockElements;
	readonly failures: BlockFailures;
	/** the position of a NodeSelection's node */
	selectedPos(): number | null;
	/** the node's own height for a block never laid out (the nodeEstimates prop) */
	nodeEstimate(node: PMNode, width: number): number | null;
	/** the editor settings the line breaking reads */
	settings(): FaceSettings;
	/** device pixels per CSS px, DPR times zoom */
	pixelRatio(): number;
	/** doc space to client px */
	clientRect(rect: DocRect): DOMRect;
	/** a measurement, an input or a mutation changed what a frame shows */
	changed(): void;
};

/** every element of a laid-out block with its border box, relative to the block's top */
function boxRects(box: LayoutBox, x: number, y: number, into: Map<FaceElement, DocRect>): Map<FaceElement, DocRect> {
	const left = x + box.x;
	const top = y + box.y;
	if (box.element && !box.pseudo && !into.has(box.element))
		into.set(box.element, { x: left, y: top, width: box.width, height: box.height });
	for (const child of box.children) boxRects(child, left, top, into);
	for (const line of box.lines ?? [])
		for (const fragment of line.fragments)
			if ((fragment.kind === 'atomic' || fragment.kind === 'widget') && fragment.box) boxRects(fragment.box, left, top, into);
	return into;
}

/** whether the textblock is the block or inside it, textblocks not entered */
function holdsTextblock(block: PMNode, textblock: PMNode): boolean {
	let found = block === textblock;
	block.descendants((child) => {
		if (child === textblock) found = true;
		return !found && !child.isTextblock;
	});
	return found;
}

function measureOf(layout: BlockLayout): BlockMeasure {
	return { height: layout.height, marginTop: layout.outerMargin.top, marginBottom: layout.outerMargin.bottom, estimated: false };
}

export class ViewDocument implements DocumentModel {
	width = 0;
	/** doc y of the pane's top edge at the last frame (the frame loop's) */
	paneTop = -Infinity;
	/** layouts made so far (frameStats().blocksLaidOut) */
	laidOut = 0;
	private readonly heights = new BlockHeights();
	private readonly cache: LayoutCache;
	private readonly estimates: BlockEstimates;
	/** bumped by the fonts, hyphenation and style epochs: every layout is stale, relaid as it is drawn */
	private layoutEpoch = 0;
	private frameDecorations: { state: EditorState; from: number; to: number; decorations: FrameDecorations } | null = null;
	private readonly breaking: ViewBreaking;
	/** the layout a replaced block had, for the block that took its place */
	private readonly carried = new WeakMap<PMNode, BlockLayout>();
	/** the layout key's epoch each layout was made under: a later one only reuses lines made under the same */
	private readonly epochs = new WeakMap<BlockLayout, string>();
	/** blocks whose elements or inputs changed under the same node: their next layout makes every line again */
	private readonly remade = new WeakSet<PMNode>();
	private readonly rects = new WeakMap<BlockLayout, Map<FaceElement, DocRect>>();
	private generation = 0;

	constructor(private readonly host: ViewDocumentHost) {
		this.cache = new LayoutCache((layout) => {
			const root = layout.box.element;
			if (root) host.elements.release(root);
		});
		this.estimates = new BlockEstimates(host.nodeEstimate);
		this.breaking = host.engine.createBreaking(this);
		this.restack();
	}

	get view(): VisualView {
		return this.host.view;
	}

	get count(): number {
		return this.host.index.count;
	}

	get height(): number {
		return this.heights.total;
	}

	get estimatedCount(): number {
		return this.heights.estimatedCount;
	}

	block(index: number): ModelBlock {
		return this.host.index.blocks[index];
	}

	indexAt(pos: number): number {
		return this.host.index.indexAt(pos);
	}

	indexAtY(y: number): number {
		return this.heights.indexAt(y);
	}

	top(index: number): { y: number; estimated: boolean } {
		return this.heights.top(index);
	}

	estimated(index: number): boolean {
		return index < this.heights.count && this.heights.measureOf(index).estimated;
	}

	/** its measured height at this width, else the height of the node it replaced, else an estimate */
	private measureFor(entry: IndexedBlock, replaced?: PMNode): BlockMeasure {
		const known = this.cache.measured(entry.node);
		if (known?.width === this.width) return { ...known, estimated: false };
		const before = known ?? (replaced?.type === entry.node.type ? this.cache.measured(replaced) : null);
		if (before) return { ...before, estimated: true };
		// no column yet: the view's own attributes are not on the root either, so a style read now would be read again
		if (!this.width) return { height: 0, marginTop: 0, marginBottom: 0, estimated: true };
		this.estimates.setEpoch(this.host.styles.epoch);
		return this.estimates.estimate(entry.node, this.width, () => this.host.styles.styleOf(this.shellOf(entry)));
	}

	private shellOf(entry: IndexedBlock): FaceElement {
		return this.host.elements.shell(entry, this.host.selectedPos());
	}

	/** every block from what was measured at this width, estimates for the rest */
	restack(): void {
		this.heights.reset(this.host.index.blocks.map((entry) => this.measureFor(entry)));
	}

	/** after a transaction replaced blocks of the index */
	replaced(change: IndexChange): void {
		change.removed.forEach((gone, i) => {
			const before = this.cache.peek(gone.node) ?? this.carried.get(gone.node);
			const next = this.host.index.blocks[change.from + i];
			if (before && next && change.from + i < change.to && next.node.type === gone.node.type) this.carried.set(next.node, before);
			this.cache.forget(gone.node);
		});
		this.host.elements.dropRemoved(change.removed);
		this.host.counters.replaced(change);
		const fresh = this.host.index.blocks.slice(change.from, change.to).map((entry, i) => this.measureFor(entry, change.removed[i]?.node));
		this.heights.splice(change.from, change.removed.length, fresh);
	}

	setWidth(width: number): void {
		if (width === this.width) return;
		this.width = width;
		this.cache.clear();
		this.restack();
	}

	/** the faces changed: every block builds and lays out again, its measured height kept until then */
	forgetLayouts(): void {
		this.cache.clear();
		this.generation++;
	}

	/** the hyphenation patterns while they load, when the settings hyphenate */
	patternsLoading(): Promise<void> | null {
		return this.host.settings().hyphenate ? (this.breaking.patternsLoading?.() ?? null) : null;
	}

	/** an input method's preedit, which the line breaking keeps whole */
	compose(preedit: { readonly from: number; readonly to: number } | null): void {
		this.breaking.compose?.(preedit);
	}

	/** after an update: textblocks the line breaking breaks again though they are unchanged (the caret left one) */
	breakingChanged(before: EditorState, state: EditorState): void {
		const again = this.breaking.update(before, state);
		if (!again.length) return;
		const { index } = this.host;
		for (const head of [state.selection.head, Math.min(before.selection.head, state.doc.content.size)]) {
			const entry = index.blocks[index.indexAt(head)];
			if (entry && again.some((node) => holdsTextblock(entry.node, node))) this.cache.drop(entry.node);
		}
	}

	/** a source fired an input key (8.5) */
	inputChanged(key: FaceInputKey): void {
		if (isLayoutEpoch(key)) this.layoutEpoch++;
		else {
			const { rebuild, relay } = readersOf(this.host.index, key, (entry) => this.cache.peek(entry.node));
			for (const entry of rebuild) this.host.elements.drop(entry);
			for (const entry of [...rebuild, ...relay]) this.relay(entry);
		}
		this.host.changed();
	}

	/** an element changed after its block's build */
	mutated(entry: IndexedBlock): void {
		this.relay(entry);
		this.host.changed();
	}

	/** the block lays out again from scratch, though its node is the same */
	private relay(entry: IndexedBlock): void {
		this.cache.drop(entry.node);
		this.remade.add(entry.node);
	}

	/** the frame's decorations, which the layouts of the blocks it covers read instead of collecting their own */
	setFrameDecorations(from: number, to: number, decorations: FrameDecorations): void {
		this.frameDecorations = { state: this.host.view.state, from, to, decorations };
	}

	/** once per frame: layouts no frame drew lately go past the cache's size */
	sweep(): void {
		this.cache.sweep();
	}

	/** the view at rest keeps the layouts of these blocks alone */
	rest({ first, last }: { readonly first: number; readonly last: number }): void {
		this.cache.keepOnly(new Set(this.host.index.blocks.slice(Math.max(0, first), last + 1).map((entry) => entry.node)));
	}

	cached(index: number): BlockLayout | null {
		const entry = this.host.index.blocks[index];
		return entry ? this.cache.get(entry.node, this.keyOf(entry)) : null;
	}

	lastLayout(index: number): BlockLayout | null {
		const entry = this.host.index.blocks[index];
		return entry ? this.cache.peek(entry.node) : null;
	}

	elements(index: number): FaceElement {
		return this.host.elements.sync(this.host.index.blocks[index], this.host.selectedPos()).dom;
	}

	layout(index: number): BlockLayout {
		const entry = this.host.index.blocks[index];
		const key = this.keyOf(entry);
		const known = this.cache.get(entry.node, key);
		if (known) return known;
		this.laidOut++;
		const epoch = `${key.epoch}#${this.generation}`;
		const layout = this.layoutIsolated(entry, this.previousFor(entry, epoch));
		this.epochs.set(layout, epoch);
		this.carried.delete(entry.node);
		this.cache.set(entry.node, key, layout, this.width);
		this.estimates.learn(entry.node, this.width, layout);
		if (this.heights.set(index, measureOf(layout), this.stepAbovePane(index))) this.host.changed();
		this.provideRects(entry, layout);
		return layout;
	}

	/** idle heights: the block's height alone, its layout and children let go unless a frame holds them */
	measure(index: number): void {
		const { node } = this.host.index.blocks[index];
		const held = this.cache.peek(node);
		this.layout(index);
		if (!held) this.cache.evict(node);
	}

	/** a paint that threw: the block is drawn as its source from the next frame */
	paintFailed(index: number, thrown: unknown): void {
		const entry = this.host.index.blocks[index];
		const error = this.host.failures.report(entry.pos, entry.node.type.name, thrown);
		const key = this.keyOf(entry);
		const layout = this.host.engine.layoutSource(
			this.requestFor(entry, entry.elements ? this.host.elements.positions(entry, this.host.selectedPos()) : undefined),
			error
		);
		this.cache.set(entry.node, key, layout, this.width);
		this.heights.set(index, measureOf(layout));
		this.provideRects(entry, layout);
	}

	/** a block wholly above the pane moves what follows by whole device pixels, which the scroll anchor takes exactly */
	private stepAbovePane(index: number): number | undefined {
		return this.heights.top(index + 1).y <= this.paneTop ? 1 / this.host.pixelRatio() : undefined;
	}

	/** the block's own stale layout or the one of the block it replaced, made under the same epoch */
	private previousFor(entry: IndexedBlock, epoch: string): BlockLayout | null {
		const remade = this.remade.delete(entry.node);
		const previous = remade ? null : (this.cache.peek(entry.node) ?? this.carried.get(entry.node) ?? null);
		return previous && this.epochs.get(previous) === epoch ? previous : null;
	}

	private decorationsFor(entry: IndexedBlock): FrameDecorations {
		const end = entry.pos + entry.node.nodeSize;
		const frame = this.frameDecorations;
		if (frame?.state === this.host.view.state && frame.from <= entry.pos && end <= frame.to) return frame.decorations;
		return collectDecorations(this.host.view, entry.pos, end);
	}

	private keyOf(entry: IndexedBlock): LayoutKey {
		const end = entry.pos + entry.node.nodeSize;
		const signature = decorationSignature(this.decorationsFor(entry), entry.pos, end, this.host.styles);
		const { justify, hyphenate } = this.host.settings();
		return { width: this.width, epoch: `${this.host.styles.epoch}.${this.layoutEpoch}.${+justify}${+hyphenate}`, signature };
	}

	private requestFor(entry: IndexedBlock, positions?: BlockPositions, previous: BlockLayout | null = null): BlockLayoutRequest {
		const root = positions ? entry.elements!.dom : (entry.elements?.dom ?? faceElement('div'));
		const map = positions ?? { posOf: () => null, elementAt: () => null, contentStart: () => null, widgets: new Map() };
		return {
			node: entry.node,
			pos: entry.pos,
			root,
			positions: map,
			widgets: map.widgets,
			width: this.width,
			styles: this.host.styles,
			marks: this.host.elements.marks,
			decorations: this.decorationsFor(entry),
			breaking: this.breaking,
			settings: this.host.settings(),
			pixelRatio: this.host.pixelRatio(),
			previous
		};
	}

	/** D33: a throw while building, styling or laying out the block, or a size that is not a number, draws it as source */
	private layoutIsolated(entry: IndexedBlock, previous: BlockLayout | null): BlockLayout {
		let positions: BlockPositions | undefined;
		try {
			positions = this.host.elements.positions(entry, this.host.selectedPos());
			const layout = this.host.engine.layoutBlock(this.requestFor(entry, positions, previous));
			if (unusableSize(layout.box.width, layout.height)) throw new Error(`a size that is not a number (${layout.height})`);
			return layout;
		} catch (thrown) {
			const error = this.host.failures.report(entry.pos, entry.node.type.name, thrown);
			return this.host.engine.layoutSource(this.requestFor(entry, positions), error);
		}
	}

	/** a face's element rects, read from the block's layout when asked: an evicted layout is not held by its root */
	private provideRects(entry: IndexedBlock, layout: BlockLayout): void {
		const root = layout.box.element;
		if (!root) return;
		provideFaceRects(root, (el) => {
			const at = this.host.index.indexOf(entry);
			if (at < 0) return null;
			const current = this.layout(at);
			let rects = this.rects.get(current);
			if (!rects) this.rects.set(current, (rects = boxRects(current.box, 0, 0, new Map())));
			const rect = rects.get(el);
			if (rect) return this.host.clientRect({ ...rect, y: rect.y + this.top(at).y });
			return this.inlineBox(el);
		});
	}

	/** an element of a text hit's chain: its text's boxes and the padding and border it draws around them, as the DOM's span */
	private inlineBox(el: FaceElement): DOMRect | null {
		const range = inlineHitRange(el);
		const text = range && rectUnion(this.host.view.canvas.geometry.rangeRects(range.from, range.to, 'text'));
		if (!text) return null;
		const levels = inlineHitLevels(el);
		const own = levels && this.host.styles.runStyle(levels.textblock, levels.chain);
		const outer =
			levels &&
			levels.chain.levels.length > 1 &&
			this.host.styles.runStyle(levels.textblock, { key: `${levels.chain.key}^`, levels: levels.chain.levels.slice(0, -1) });
		const start = own ? own.edges.start - (outer ? outer.edges.start : 0) : 0;
		const end = own ? own.edges.end - (outer ? outer.edges.end : 0) : 0;
		const top = own?.blockEdges?.top ?? 0;
		const bottom = own?.blockEdges?.bottom ?? 0;
		return this.host.clientRect({
			x: text.x - start,
			y: text.y - top,
			width: text.width + start + end,
			height: text.height + top + bottom
		});
	}
}
