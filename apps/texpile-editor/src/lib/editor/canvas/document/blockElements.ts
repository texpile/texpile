// each top-level block's element tree, kept current with the state's decorations, and its element to position map (3.3)
import type { Node as PMNode } from 'prosemirror-model';
import { DecorationSet, type Decoration, type DecorationSource } from 'prosemirror-view';
import type { WidgetDecorationView } from '../contracts/decorationTypes';
import type { DocumentCounters } from '../contracts/faceTypes';
import type { FaceInputKey } from '../contracts/invalidationTypes';
import type { CanvasBuildHelpers } from '../contracts/nodeViewTypes';
import type { PositionMap } from '../contracts/layoutTypes';
import type { CanvasProps } from '../contracts/viewTypes';
import { provideDetachedBuild } from '../geometry/caretPolicy';
import { buildHelpersOf, faceScopesOf, type FaceScopeSource } from '../views/faceContext';
import { nodeViewOf } from '../views/viewRegistry';
import { copyDecoration, isWidget, localDecorations } from '../decorations/decorationAttrs';
import { FaceElement, watchFaceMutations } from '../tree/faceElement';
import { groupDecorationSources } from '../tree/decorationElements';
import { MarkViewDescs } from '../tree/markViewDesc';
import {
	descAt,
	descHolding,
	NodeViewDesc,
	updateDesc,
	type SelectedNodeMarker,
	type ViewDesc,
	type ViewDescBuild
} from '../tree/nodeViewDesc';
import type { BlockIndex, CounterRead, IndexedBlock } from './blockIndex';
import { inputKeyOf } from './invalidation';

export type BlockElementsHost = Omit<FaceScopeSource, 'props'> & {
	/** view.dom, the parent of every top-level block's root (prosemirror-tables' domInCell stops there) */
	readonly dom: HTMLElement;
	readonly counters: DocumentCounters;
	props(): CanvasProps;
	/** the default selectNode's look */
	readonly selectedNode: SelectedNodeMarker;
	/** an element of a built block changed after the build (a late caption, a decoration's attribute) */
	mutated(entry: IndexedBlock): void;
	readonly overlaid?: Set<NodeViewDesc>;
};

/** a block's elements by the positions they stand for, offsets from the block's start */
export class BlockPositions implements PositionMap {
	private readonly offsets = new Map<FaceElement, number>();
	private readonly starts = new Map<number, FaceElement>();
	private readonly holes = new Map<FaceElement, number>();
	private readonly owners = new Map<FaceElement, NodeViewDesc>();
	readonly widgets = new Map<FaceElement, WidgetDecorationView>();

	constructor(top: NodeViewDesc) {
		this.add(top, 0);
	}

	private add(desc: ViewDesc, offset: number): void {
		if (!(desc instanceof NodeViewDesc)) {
			if (desc.dom) this.widgets.set(desc.dom, desc.widget);
			return;
		}
		for (const el of [desc.dom, desc.nodeDOM]) {
			this.offsets.set(el, offset);
			this.owners.set(el, desc);
		}
		this.starts.set(offset, desc.nodeDOM);
		if (!desc.contentDOM) return;
		this.holes.set(desc.contentDOM, offset + 1);
		this.owners.set(desc.contentDOM, desc);
		for (const child of desc.children) this.add(child, child instanceof NodeViewDesc ? offset + 1 + child.offset : 0);
	}

	posOf(element: FaceElement): number | null {
		return this.offsets.get(element) ?? null;
	}

	elementAt(offset: number): FaceElement | null {
		return this.starts.get(offset) ?? null;
	}

	contentStart(element: FaceElement): number | null {
		return this.holes.get(element) ?? null;
	}

	/** the node an element of the tree belongs to: its dom, its contentDOM, or an element between them */
	ownerOf(element: FaceElement): NodeViewDesc | null {
		for (let at: FaceElement | HTMLElement | null = element; at && 'hole' in at; at = at.parentNode) {
			const owner = this.owners.get(at);
			if (owner) return owner;
		}
		return null;
	}
}

export class BlockElements {
	private source: DecorationSource = DecorationSet.empty;
	private locals: readonly Decoration[] = [];
	/** widgets the document holds between its blocks, which no block's own decorations carry */
	private between: readonly Decoration[] = [];
	private docEnd = 0;
	private selected: NodeViewDesc | null = null;
	private readonly entries = new WeakMap<FaceElement, IndexedBlock>();
	private readonly watching = new Map<FaceElement, () => void>();
	private readonly positionCache = new WeakMap<IndexedBlock, { source: DecorationSource; unit: NodeViewDesc; positions: BlockPositions }>();

	private readonly scopes: ReturnType<typeof faceScopesOf>;
	/** the view's mark views, built again with its node views */
	marks: MarkViewDescs;

	constructor(private readonly host: BlockElementsHost) {
		this.scopes = faceScopesOf(host);
		// a mark view and a node view built detached record what they read nowhere: no block holds them
		const { scopes } = this;
		function detached(): CanvasBuildHelpers {
			return buildHelpersOf(scopes.build(() => {}, host.counters));
		}
		provideDetachedBuild(host.view, detached);
		this.marks = new MarkViewDescs(host.props().markViews, host.view, detached);
	}

	/** a node's own height for a block never laid out (the nodeEstimates prop) */
	estimate(node: PMNode, width: number): number | null {
		return this.scopes.estimate(node, width);
	}

	/** the decorations of the state every later sync builds with */
	setDecorations(doc: PMNode, source: DecorationSource): void {
		this.source = source;
		const locals = localDecorations(source, doc);
		this.locals = locals.filter((d) => !isWidget(d));
		this.between = locals.filter(isWidget);
		this.docEnd = doc.content.size;
	}

	private outerOf(entry: IndexedBlock): readonly Decoration[] {
		let low = 0;
		let high = this.locals.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (this.locals[mid].from < entry.pos) low = mid + 1;
			else high = mid;
		}
		const outer: Decoration[] = [];
		for (let i = low; i < this.locals.length && this.locals[i].from === entry.pos; i++)
			if (this.locals[i].to === entry.pos + entry.node.nodeSize) outer.push(this.locals[i]);
		return outer;
	}

	private countersStale(entry: IndexedBlock): boolean {
		return entry.counterReads.some((read) => this.host.counters.at(entry.pos + read.offset, read.name) !== read.value);
	}

	/** the block's views, built or updated for the current state; shallow leaves a new block's children for later */
	sync(entry: IndexedBlock, selectedPos: number | null, shallow = false): NodeViewDesc {
		const before = entry.elements?.dom ?? null;
		if (entry.elements && this.countersStale(entry)) this.drop(entry);
		const { counters } = this.host;
		const reads: CounterRead[] = [];
		const recording: DocumentCounters = {
			at(pos, name) {
				const value = counters.at(pos, name);
				reads.push({ offset: pos - entry.pos, name, value });
				return value;
			}
		};
		function record(key: FaceInputKey): void {
			entry.keys.set(inputKeyOf(key), key);
		}
		const scope = this.scopes.build(record, recording);
		const props = this.host.props();
		const build: ViewDescBuild = {
			view: this.host.view,
			nodeViewOf: (node) => nodeViewOf(props, node),
			scope,
			tools: buildHelpersOf(scope),
			marks: this.marks,
			selectedNode: this.host.selectedNode,
			selectedPos,
			shallow,
			overlaid: this.host.overlaid
		};
		const outer = this.outerOf(entry);
		const inner = this.innerOf(entry);
		const placement = { parent: null, offset: 0, base: () => entry.pos };
		let unit = entry.elements;
		if (unit && !updateDesc(unit, entry.node, outer, inner, placement, build)) {
			this.drop(entry);
			unit = null;
		}
		if (!unit) unit = NodeViewDesc.create(entry.node, outer, inner, placement, build);
		this.adoptSelected(entry, unit, selectedPos);
		if (reads.length) entry.noteCounterReads(reads);
		entry.hold(unit);
		unit.dom.parentNode = this.host.dom;
		this.entries.set(unit.dom, entry);
		if (unit.dom === before) return unit;
		this.watch(unit.dom, before);
		// a rebuild mutates nothing it watches, yet the layout drew the old tree
		if (before) this.host.mutated(entry);
		return unit;
	}

	/** the block's own decorations; a widget standing before it, or after the last block, is drawn inside it at that edge */
	private innerOf(entry: IndexedBlock): DecorationSource {
		const inner = this.source.forChild(entry.pos, entry.node);
		const end = entry.pos + entry.node.nodeSize;
		const { docEnd } = this;
		const moved = this.between.flatMap((widget) => {
			if (widget.from === entry.pos) return [copyDecoration(widget, 0, 0)];
			if (widget.from === docEnd && end === docEnd) return [copyDecoration(widget, entry.node.content.size, entry.node.content.size)];
			return [];
		});
		return moved.length ? groupDecorationSources([inner, DecorationSet.create(entry.node, moved)]) : inner;
	}

	/** the block's outer element: its built root, or the top node's own view alone */
	shell(entry: IndexedBlock, selectedPos: number | null): FaceElement {
		return entry.elements?.dom ?? this.sync(entry, selectedPos, true).dom;
	}

	/** a block whose layout was evicted: its children go until it is laid out again */
	release(root: FaceElement): void {
		const entry = this.entries.get(root);
		if (!entry) return;
		entry.elements?.releaseChildren();
		this.positionCache.delete(entry);
	}

	/** builds again from the views at the next sync (an input the views read changed) */
	drop(entry: IndexedBlock): void {
		if (!entry.elements) return;
		this.unwatch(entry.elements.dom);
		entry.elements.destroy();
		entry.hold(null);
		entry.forgetReads();
	}

	private watch(root: FaceElement, replaced: FaceElement | null): void {
		if (replaced) this.unwatch(replaced);
		this.watching.set(
			root,
			watchFaceMutations(root, () => {
				const entry = this.entries.get(root);
				if (entry?.elements?.dom === root) this.host.mutated(entry);
			})
		);
	}

	private unwatch(root: FaceElement): void {
		this.watching.get(root)?.();
		this.watching.delete(root);
	}

	/** the block an element of a built tree belongs to */
	entryOfRoot(el: FaceElement): IndexedBlock | null {
		let root = el;
		while (root.parentNode instanceof FaceElement) root = root.parentNode;
		const entry = this.entries.get(root);
		return entry?.elements?.dom === root ? entry : null;
	}

	positions(entry: IndexedBlock, selectedPos: number | null): BlockPositions {
		const cached = this.positionCache.get(entry);
		if (cached && cached.source === this.source && cached.unit === entry.elements && cached.unit.node === entry.node && cached.unit.filled)
			return cached.positions;
		const unit = this.sync(entry, selectedPos);
		const positions = new BlockPositions(unit);
		this.positionCache.set(entry, { source: this.source, unit, positions });
		return positions;
	}

	/** every block builds again from its views, as prosemirror-view redraws for changed nodeViews */
	forget(index: BlockIndex): void {
		for (const entry of index.blocks) this.drop(entry);
		this.selected = null;
		this.marks.destroy();
		this.marks = this.marks.withViews(this.host.props().markViews);
	}

	/** the elements of blocks a transaction replaced and did not carry */
	dropRemoved(removed: readonly IndexedBlock[]): void {
		for (const entry of removed) if (entry.elements) this.unwatch(entry.elements.dom);
	}

	/** selectionToDOM's node selection: deselects the last selected view, selects the node a NodeSelection holds or the formula a math session edits */
	markSelection(index: BlockIndex, selected: number | null): void {
		let desc: NodeViewDesc | null = null;
		if (selected !== null && index.count) {
			const entry = index.blocks[index.indexAt(selected)];
			desc = descAt(this.sync(entry, selected), selected - entry.pos);
		}
		if (desc === this.selected) return;
		this.selected?.deselectNode(this.host.selectedNode);
		desc?.selectNode(this.host.selectedNode);
		this.selected = desc;
	}

	/** a rebuild selects the node at selectedPos as it builds it; markSelection deselects that one, not the destroyed one */
	private adoptSelected(entry: IndexedBlock, unit: NodeViewDesc, selectedPos: number | null): void {
		if (selectedPos === null || selectedPos < entry.pos || selectedPos >= entry.pos + entry.node.nodeSize) return;
		const desc = descAt(unit, selectedPos - entry.pos);
		if (!desc?.isSelected || desc === this.selected) return;
		this.selected?.deselectNode(this.host.selectedNode);
		this.selected = desc;
	}

	/** the node a NodeSelection holds, or the innermost one whose content strictly holds from and to; null outside every block */
	holding(index: BlockIndex, from: number, to: number, selectedPos: number | null, node: boolean): NodeViewDesc | null {
		if (!index.count) return null;
		const entry = index.blocks[index.indexAt(from)];
		if (to > entry.pos + entry.node.nodeSize) return null;
		const top = this.sync(entry, selectedPos);
		return node ? descAt(top, from - entry.pos) : descHolding(top, from - entry.pos, to - entry.pos);
	}

	destroy(index: BlockIndex): void {
		this.forget(index);
		for (const stop of this.watching.values()) stop();
		this.watching.clear();
	}
}
