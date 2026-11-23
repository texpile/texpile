// the box tree of a block's element tree (CSS 2.2 9.2)
import type { Node as PMNode } from 'prosemirror-model';
import type { FrameDecorations, WidgetDecorationView } from '../contracts/decorationTypes';
import type { LayoutBoxBuilder, LayoutBoxKind, PositionMap } from '../contracts/layoutTypes';
import type { CanvasStyles, ComputedStyle, LayoutStyle } from '../contracts/styleTypes';
import { FaceElement } from '../tree/faceElement';
import { faceContent, framesInline, runStyleOf, textblockContent, type InlineGenerated, type InlinePiece } from './inline/inlineContent';
import type { InlineFlowSource } from './inline/inlineFlow';
import { isBlockLevel } from './inline/lineBoxes';
import { collapseFaceText } from './inline/whiteSpace';
import { NodeLocator } from './nodeLocator';
import { TO_DOM_MARKS, type MarkViewDescs } from '../tree/markViewDesc';

/** what the tree reads of one top-level block (C1's BlockLayoutRequest) */
export type BoxTreeSource = {
	readonly node: PMNode;
	readonly pos: number;
	readonly root: FaceElement;
	readonly positions: PositionMap;
	readonly widgets: ReadonlyMap<FaceElement, WidgetDecorationView>;
	readonly styles: CanvasStyles;
	readonly marks?: MarkViewDescs;
	readonly decorations: FrameDecorations;
};

type ChildItem =
	| { readonly kind: 'element'; readonly element: FaceElement; readonly style: ComputedStyle }
	| { readonly kind: 'text'; readonly text: string; readonly style: ComputedStyle }
	| { readonly kind: 'pseudo'; readonly piece: InlineGenerated; readonly style: ComputedStyle };

type GeneratedPart = 'before' | 'after' | 'marker';
const GENERATED_FIELDS = { before: 'generatedBefore', after: 'generatedAfter', marker: 'generatedMarker' } as const;

type HeldTextblock = { readonly hole: FaceElement; readonly node: PMNode; readonly offset: number };

/** the box an absolute descendant is placed in, and the boxes from it down to where the descendant stood */
type Holder = { readonly box: LayoutBoxBuilder; readonly path: readonly LayoutBoxBuilder[] };

/** an absolute box with the boxes from its containing box down to the one it stood in, and where in that one it stood */
export type OutOfFlowBox = {
	readonly box: LayoutBoxBuilder;
	readonly path: readonly LayoutBoxBuilder[];
	readonly stood: 'start' | 'end';
};

const ZERO = { px: 0, percent: 0 };
const BOX_KINDS: Partial<Record<LayoutStyle['display'], LayoutBoxKind>> = {
	'inline-block': 'inline-block',
	inline: 'inline-block',
	flex: 'flex',
	'inline-flex': 'flex',
	grid: 'grid',
	'inline-grid': 'grid',
	table: 'table',
	'inline-table': 'table',
	'table-row': 'row',
	'table-cell': 'cell'
};

/** an anonymous block takes its parent's inherited style and nothing of its box */
function anonymousStyle(parent: ComputedStyle): ComputedStyle {
	const edges = { top: ZERO, right: ZERO, bottom: ZERO, left: ZERO };
	const layout: LayoutStyle = {
		...parent.layout,
		display: 'block',
		position: 'static',
		float: 'none',
		width: 'auto',
		height: 'auto',
		minWidth: 'auto',
		minHeight: 'auto',
		maxWidth: 'none',
		maxHeight: 'none',
		aspectRatio: null,
		margin: edges,
		padding: edges,
		borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
		overflowX: 'visible',
		overflowY: 'visible',
		columns: { ...parent.layout.columns, count: null },
		transform: null
	};
	return { ...parent, layout };
}

/** a generated box's own margin, padding and border on one side */
function inlineSide(layout: LayoutStyle, name: 'left' | 'right'): number {
	const margin = layout.margin[name];
	return (margin === 'auto' ? 0 : margin.px) + layout.padding[name].px + layout.borderWidth[name];
}

function isPositioned(style: ComputedStyle): boolean {
	return style.layout.position !== 'static';
}

function isInlineLevel(item: ChildItem): boolean {
	return item.kind !== 'element' || !isBlockLevel(item.style.layout);
}

/** a row built before and still good: its box, with the cells it kept */
export type RowSource = {
	reuse(element: FaceElement, style: ComputedStyle, node: PMNode, offset: number): LayoutBoxBuilder | null;
};

export class BoxTree {
	private readonly nodes: NodeLocator;
	private readonly sources = new WeakMap<LayoutBoxBuilder, () => InlineFlowSource>();
	private readonly read = new WeakMap<LayoutBoxBuilder, InlineFlowSource | null>();
	private readonly outOfFlow = new WeakMap<LayoutBoxBuilder, OutOfFlowBox[]>();
	private readonly trailing = new WeakMap<LayoutBoxBuilder, LayoutBoxBuilder[]>();

	constructor(
		private readonly source: BoxTreeSource,
		private readonly rows: RowSource | null = null
	) {
		this.nodes = new NodeLocator(source.node);
	}

	styleOf(el: FaceElement, pseudo?: GeneratedPart): ComputedStyle | null {
		return this.source.styles.styleOf(el, pseudo);
	}

	/** the inline content a box holds, read when the box is laid out */
	inlineSource(box: LayoutBoxBuilder): InlineFlowSource | null {
		let source = this.read.get(box);
		if (source === undefined) {
			source = this.sources.get(box)?.() ?? null;
			this.read.set(box, source);
		}
		return source;
	}

	/** a kept cell's content built again, in the box the table already holds */
	remake(box: LayoutBoxBuilder, style: ComputedStyle): void {
		const fresh = this.build(box.element!, style, null);
		const { children, lines, node, baselines, scroll, clip } = fresh;
		Object.assign(box, { children, lines, node, baselines, scroll, clip });
		const source = this.sources.get(fresh);
		if (source) this.sources.set(box, source);
		const held = this.outOfFlow.get(fresh);
		if (held) this.outOfFlow.set(box, held);
		const trailing = this.trailing.get(fresh);
		if (trailing) this.trailing.set(box, trailing);
		this.read.delete(box);
	}

	/** the floats generated at the end of a textblock's content: they sit on its last line or under it */
	trailingFloatsOf(box: LayoutBoxBuilder): readonly LayoutBoxBuilder[] {
		return this.trailing.get(box) ?? [];
	}

	/** the absolute boxes whose containing block is this box's padding box */
	outOfFlowIn(box: LayoutBoxBuilder): readonly OutOfFlowBox[] {
		return this.outOfFlow.get(box) ?? [];
	}

	/** a box built alone (the block's root, an atomic inline) holds the absolute boxes no positioned box inside it holds */
	boxOf(element: FaceElement, style: ComputedStyle): LayoutBoxBuilder {
		return this.build(element, style, null);
	}

	private build(element: FaceElement, style: ComputedStyle, containing: Holder | null): LayoutBoxBuilder {
		const { layout } = style;
		const offset = this.source.positions.posOf(element);
		const node = offset === null ? null : this.nodes.at(offset);
		const kind: LayoutBoxKind = element.replaced
			? 'replaced'
			: layout.columns.count !== null
				? 'columns'
				: (BOX_KINDS[layout.display] ?? 'block');
		if (kind === 'row' && node && offset !== null) {
			const kept = this.rows?.reuse(element, style, node, offset);
			if (kept) return kept;
		}
		const box = this.blank(element, style, kind);
		box.node = node && offset !== null ? { node, offset } : null;
		if (element.replaced) return box;
		const holder = !containing || isPositioned(style) ? { box, path: [] } : { box: containing.box, path: [...containing.path, box] };
		this.positionPseudo(element, holder, 'before');
		this.positionPseudo(element, holder, 'after');
		this.positionPseudo(element, holder, 'marker');
		this.floatAfter(element, box);
		const textblock = this.textblockOf(element) ?? (isBlockLevel(layout) ? this.wrappedTextblockOf(element) : null);
		if (textblock) {
			const { hole, node, offset: at } = textblock;
			this.sources.set(box, () => ({ node, offset: at, pieces: this.textblockPieces(hole, node, at) }));
			return box;
		}
		const items = this.childItems(element, style, holder);
		const blockified = kind === 'flex' || kind === 'grid' || kind === 'table' || kind === 'row';
		if (!blockified && items.every(isInlineLevel) && !items.some((item) => this.inlineTextblockOf(item))) {
			if (items.length)
				this.sources.set(box, () => ({ node: null, offset: this.ownerOffset(element), pieces: this.facePieces(items, element) }));
			return box;
		}
		let run: ChildItem[] = [];
		let held: HeldTextblock | null = null;
		const endRun = (): void => {
			if (!run.length) return;
			const anonymous = this.blank(held?.hole ?? null, anonymousStyle(style), 'anonymous');
			const pieces = run;
			const textblock = held;
			anonymous.node = textblock && { node: textblock.node, offset: textblock.offset };
			this.sources.set(anonymous, () => ({
				node: textblock?.node ?? null,
				offset: textblock?.offset ?? this.ownerOffset(element),
				pieces: this.facePieces(pieces, element)
			}));
			box.children.push(anonymous);
			run = [];
			held = null;
		};
		for (const item of items) {
			if (item.kind === 'element' && (blockified || !isInlineLevel(item))) {
				endRun();
				box.children.push(this.build(item.element, item.style, holder));
				continue;
			}
			if (blockified && item.kind === 'text' && !item.text.trim()) continue;
			const textblock = this.inlineTextblockOf(item);
			if (textblock && held) endRun();
			held ??= textblock;
			run.push(item);
		}
		endRun();
		return box;
	}

	private blank(element: FaceElement | null, style: ComputedStyle, kind: LayoutBoxKind): LayoutBoxBuilder {
		const { overflowX, overflowY } = style.layout;
		return {
			element,
			pseudo: null,
			style,
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			margin: { top: 0, right: 0, bottom: 0, left: 0 },
			kind,
			children: [],
			lines: null,
			node: null,
			baselines: null,
			scroll: null,
			clip: overflowX !== 'visible' || overflowY !== 'visible'
		};
	}

	private textblockOf(element: FaceElement): HeldTextblock | null {
		if (!element.hole) return null;
		const start = this.source.positions.contentStart(element);
		if (start === null) return null;
		const node = this.nodes.at(start - 1);
		return node?.isTextblock ? { hole: element, node, offset: start - 1 } : null;
	}

	/** toDOM's ['pre', ['code', 0]]: the hole is the only, inline, child of the block that lays its lines out */
	private wrappedTextblockOf(element: FaceElement): HeldTextblock | null {
		const child = element.childNodes.length === 1 ? element.firstElementChild : null;
		if (!child || this.styleOf(child)?.layout.display !== 'inline') return null;
		return this.textblockOf(child) ?? this.wrappedTextblockOf(child);
	}

	/** a paragraph set display: inline (a Typst term's description): its anonymous block lays its lines out as the textblock's */
	private inlineTextblockOf(item: ChildItem): HeldTextblock | null {
		return item.kind === 'element' && item.style.layout.display === 'inline' && !item.element.replaced
			? this.textblockOf(item.element)
			: null;
	}

	/** an atom's content (an inline formula without its face): drawn as the face's own text, the caret kept out */
	private atomTextOf(element: FaceElement): string | null {
		const start = element.hole ? this.source.positions.contentStart(element) : null;
		const node = start === null ? null : this.nodes.at(start - 1);
		return node && node.isAtom && !node.isTextblock ? node.textContent : null;
	}

	/** the offset of the node an element of a face belongs to */
	private ownerOffset(element: FaceElement): number {
		for (let at: FaceElement | HTMLElement | null = element; at instanceof FaceElement; at = at.parentNode) {
			const offset = this.source.positions.posOf(at);
			if (offset !== null) return offset;
		}
		return 0;
	}

	private textblockPieces(hole: FaceElement, node: PMNode, offset: number): InlinePiece[] {
		const { source } = this;
		return textblockContent({
			node,
			offset,
			hole,
			blockPos: source.pos,
			styles: source.styles,
			marks: source.marks ?? TO_DOM_MARKS,
			positions: source.positions,
			widgets: source.widgets,
			decorations: source.decorations,
			generated: (pseudo) => this.generated(hole, pseudo, pseudo === 'before' ? offset + 1 : offset + node.nodeSize - 1)
		});
	}

	private facePieces(items: readonly ChildItem[], owner: FaceElement): InlinePiece[] {
		const at = this.ownerOffset(owner);
		const styleOf = (el: FaceElement): ComputedStyle | null => this.styleOf(el);
		return items.flatMap((item): InlinePiece[] => {
			if (item.kind === 'pseudo') return [item.piece];
			if (item.kind === 'text') {
				const text = collapseFaceText(item.text, item.style.layout.whiteSpace);
				return text ? [{ kind: 'text', from: at, to: at, text, run: runStyleOf(item.style), edgeStart: 0, edgeEnd: 0, struck: null }] : [];
			}
			const textblock = this.inlineTextblockOf(item);
			if (textblock) return this.textblockPieces(textblock.hole, textblock.node, textblock.offset);
			if (item.style.layout.display === 'inline' && !item.element.replaced && !framesInline(item.style))
				return faceContent(item.element, at, styleOf);
			return [{ kind: 'object', at, size: 0, element: item.element, style: item.style, side: null }];
		});
	}

	private hold(holder: Holder, box: LayoutBoxBuilder, stood: 'start' | 'end'): void {
		const held = this.outOfFlow.get(holder.box);
		const entry = { box, path: holder.path, stood };
		if (held) held.push(entry);
		else this.outOfFlow.set(holder.box, [entry]);
	}

	/** an absolute generated part: a box of its own holding its text */
	private positionPseudo(element: FaceElement, holder: Holder, pseudo: GeneratedPart): void {
		const style = this.styleOf(element, pseudo);
		if (style?.layout.position !== 'absolute' || style.layout.display === 'none' || !element[GENERATED_FIELDS[pseudo]]) return;
		// an empty part still takes its box, as content: '' does: a selected cell's wash
		const at = this.ownerOffset(element);
		const piece = this.generatedPiece(element, pseudo, style, at);
		const box = this.blank(null, style, 'block');
		box.pseudo = pseudo;
		this.sources.set(box, () => ({ node: null, offset: at, pieces: piece ? [piece] : [] }));
		this.hold(holder, box, pseudo === 'after' ? 'end' : 'start');
	}

	private floatAfter(element: FaceElement, host: LayoutBoxBuilder): void {
		const style = this.styleOf(element, 'after');
		if (!style || style.layout.float === 'none' || style.layout.display === 'none') return;
		const piece = this.generatedPiece(element, 'after', style, this.ownerOffset(element));
		if (!piece) return;
		const box = this.blank(null, style, 'block');
		box.pseudo = 'after';
		this.sources.set(box, () => ({ node: null, offset: piece.at, pieces: [piece] }));
		this.trailing.set(host, [...(this.trailing.get(host) ?? []), box]);
	}

	private childItems(element: FaceElement, style: ComputedStyle, holder: Holder): ChildItem[] {
		const items: ChildItem[] = [];
		const before = this.generated(element, 'before', this.ownerOffset(element));
		if (before) items.push({ kind: 'pseudo', piece: before, style: before.style });
		const visit = (parent: FaceElement, parentStyle: ComputedStyle): void => {
			const atomText = this.atomTextOf(parent);
			if (atomText !== null) {
				if (atomText) items.push({ kind: 'text', text: atomText, style: parentStyle });
				return;
			}
			for (const child of parent.childNodes) {
				if (!(child instanceof FaceElement)) {
					if (child.textContent) items.push({ kind: 'text', text: child.textContent, style: parentStyle });
					continue;
				}
				const childStyle = this.styleOf(child);
				if (!childStyle || childStyle.layout.display === 'none') continue;
				if (childStyle.layout.position === 'absolute') {
					this.hold(holder, this.build(child, childStyle, holder), 'start');
					continue;
				}
				if (childStyle.layout.display === 'contents') visit(child, childStyle);
				else items.push({ kind: 'element', element: child, style: childStyle });
			}
		};
		visit(element, style);
		const after = this.generated(element, 'after', this.ownerOffset(element));
		if (after) items.push({ kind: 'pseudo', piece: after, style: after.style });
		return items;
	}

	/** an in-flow inline generated part with its text; floated ones are W5's */
	private generated(element: FaceElement, pseudo: 'before' | 'after', at: number): InlineGenerated | null {
		const style = this.styleOf(element, pseudo);
		const layout = style?.layout;
		if (!style || !layout || layout.display !== 'inline' || layout.position === 'absolute' || layout.float !== 'none') return null;
		return this.generatedPiece(element, pseudo, style, at);
	}

	private generatedPiece(element: FaceElement, pseudo: GeneratedPart, style: ComputedStyle, at: number): InlineGenerated | null {
		const layout = style.layout;
		const text = element[GENERATED_FIELDS[pseudo]]?.textContent;
		if (!text) return null;
		return { kind: 'generated', at, text, style, run: runStyleOf(style), edges: inlineSide(layout, 'left') + inlineSide(layout, 'right') };
	}
}
