// one top-level block laid out (5.1 to 5.4)
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout, FormattingContext, LayoutBoxBuilder, LayoutInput, TextMeasure } from '../contracts/layoutTypes';
import type { ComputedStyle, LengthOr } from '../contracts/styleTypes';
import type { BlockLayoutRequest } from '../contracts/engineTypes';
import { FaceElement } from '../tree/faceElement';
import {
	blockHeight,
	blockWidth,
	collapseOwnMargins,
	horizontalPadding,
	layoutBlockChildren,
	lengthPx,
	verticalPadding
} from './blockFlow';
import { BoxTree, type OutOfFlowBox } from './boxTree';
import { flexIntrinsicWidths, layoutFlex } from './formatting/flexLayout';
import { gridIntrinsicWidths, layoutGrid } from './formatting/gridLayout';
import { layoutColumns } from './formatting/multiColumn';
import { inlineItems } from './inline/inlineItems';
import { LINE_FIT_SLACK } from './inline/lineBreaking';
import { layoutInlineFlow, measureRun, type InlineFlowContext, type InlineFlowSource } from './inline/inlineFlow';
import { isBlockLevel } from './inline/lineBoxes';
import { flowsOf, keepFlows, rememberFlow, reuseFlow, type FlowMemory } from './linebreak/flowReuse';
import { ViewLineBreaking } from './linebreak/viewBreaking';
import { absoluteRoom, placePositioned } from './positioned';
import { sizeReplaced } from './replaced';
import { turnsContent } from './transforms';
import { firstLineInset } from './floats';
import { DecorationRanges } from './table/memory/decorationRanges';
import { keepRows, rowsOf } from './table/memory/rowMemory';
import { tableIntrinsicWidths } from './table/tableIntrinsic';
import { layoutTable } from './table/tableLayout';
import { TableMemory } from './table/memory/tableMemory';
import type { FontMetricsReader } from './text/fontMetrics';

export type LayoutTools = { readonly measure: TextMeasure; readonly metrics: FontMetricsReader };

type Containing = { readonly width: number; readonly height: number | null };

function formattingContextOf(box: LayoutBoxBuilder): FormattingContext | null {
	if (box.kind === 'flex') return layoutFlex;
	if (box.kind === 'grid') return layoutGrid;
	if (box.kind === 'table') return layoutTable;
	if (box.kind === 'columns') return layoutColumns;
	return null;
}

const hyphenatorIds = new WeakMap<object, number>();
let hyphenators = 0;

/** what every flow of a layout is broken under, comparable across layouts */
function breakingKeyOf(flow: InlineFlowContext): string {
	const patterns = flow.hyphenator;
	let id = patterns ? hyphenatorIds.get(patterns) : 0;
	if (id === undefined) hyphenatorIds.set(patterns!, (id = ++hyphenators));
	return `${+flow.justify}|${id}|${flow.pixelRatio}`;
}

function marginOf(margin: LengthOr<'auto'>): number {
	return margin === 'auto' ? 0 : margin.px;
}

function verticalMargin(style: ComputedStyle, side: 'top' | 'bottom', containing: number): number {
	const margin = style.layout.margin[side];
	return margin === 'auto' ? 0 : lengthPx(margin, containing);
}

class BlockLayouter {
	private readonly tree: BoxTree;
	private readonly flow: InlineFlowContext;
	private readonly breakingKey: string;
	private readonly earlier: FlowMemory | null;
	private readonly flows: FlowMemory = new Map();
	/** markers and absolute boxes, which join their holder's children after its in-flow layout */
	private readonly outOfFlow = new WeakSet<LayoutBoxBuilder>();
	private readonly tables: TableMemory;
	private readonly transientNodes = new Set<PMNode>();
	private decorationRanges: DecorationRanges | null = null;

	constructor(
		private readonly request: BlockLayoutRequest,
		private readonly tools: LayoutTools
	) {
		// a ViewBreaking of the view's test doubles keeps no lines and has no patterns
		const view = request.breaking instanceof ViewLineBreaking ? request.breaking : null;
		this.flow = {
			measure: tools.measure,
			metrics: tools.metrics,
			justify: request.settings.justify,
			hyphenator: request.settings.hyphenate ? (view?.hyphenator ?? null) : null,
			kept: view?.kept ?? null,
			blockPos: request.pos,
			pixelRatio: request.pixelRatio,
			layoutObject: (element, style, available) => this.layoutObject(element, style, available)
		};
		this.breakingKey = breakingKeyOf(this.flow);
		this.tables = new TableMemory(rowsOf(request.previous, this.breakingKey), {
			pos: request.pos,
			decorated: (from, to) => (this.decorationRanges ??= new DecorationRanges(request.decorations)).touches(from, to),
			typing: (from, to, textblocks) => this.typing(from, to, textblocks),
			transient: this.transientNodes,
			remake: (box, style) => this.tree.remake(box, style)
		});
		this.tree = new BoxTree(request, this.tables);
		this.earlier = flowsOf(request.previous);
	}

	layoutRoot(): BlockLayout {
		const { request } = this;
		const style = request.styles.styleOf(request.root);
		const box = this.tree.boxOf(request.root, style!);
		const horizontal = blockWidth(box.style.layout, request.width, () => this.intrinsic(box));
		box.margin = {
			top: verticalMargin(box.style, 'top', request.width),
			right: horizontal.marginRight,
			bottom: verticalMargin(box.style, 'bottom', request.width),
			left: horizontal.marginLeft
		};
		this.layoutBox(box, horizontal.width, { width: request.width, height: null });
		box.x = horizontal.marginLeft;
		const layout: BlockLayout = {
			box,
			height: box.height,
			outerMargin: { top: box.margin.top, bottom: box.margin.bottom },
			positions: request.positions,
			keys: [],
			error: null
		};
		keepFlows(layout, this.flows);
		keepRows(layout, this.breakingKey, this.tables.rows);
		return layout;
	}

	private inputFor(width: number, height: number | null): LayoutInput {
		return {
			width,
			height,
			measure: this.tools.measure,
			layout: (child, childWidth) => this.layoutBox(child, childWidth, { width, height }),
			intrinsic: (child) => this.intrinsic(child)
		};
	}

	/** lays a box out at a border-box width; its margins are set by the parent */
	layoutBox(draft: LayoutBoxBuilder, width: number, containing: Containing): void {
		if (draft.kind === 'cell' && this.tables.settle(draft, width)) return;
		// a formatting context may lay a child out twice: the boxes out of flow join the children once in flow is done
		if (draft.children.some((child) => this.outOfFlow.has(child)))
			draft.children = draft.children.filter((child) => !this.outOfFlow.has(child));
		this.layoutInFlow(draft, width, containing);
		for (const held of this.tree.outOfFlowIn(draft)) this.placeAbsolute(draft, held);
		if (draft.kind === 'cell') this.tables.laidOut(draft, width);
	}

	private placeAbsolute(holder: LayoutBoxBuilder, { box, path, stood }: OutOfFlowBox): void {
		const own = holder.style.layout.borderWidth;
		const padding = { x: own.left, y: own.top, width: holder.width - own.left - own.right, height: holder.height - own.top - own.bottom };
		const room = absoluteRoom(box.style.layout, padding);
		const horizontal = blockWidth(box.style.layout, room.width, () => this.intrinsic(box), !room.fills);
		this.layoutBox(box, horizontal.width, { width: padding.width, height: padding.height });
		let x = 0;
		let y = 0;
		for (const step of path) {
			x += step.x;
			y += step.y;
		}
		const parent = path.at(-1) ?? holder;
		const parentStyle = parent.style.layout;
		const contentTop = parentStyle.borderWidth.top + lengthPx(parentStyle.padding.top, parent.width);
		const contentBottom = parent.height - parentStyle.borderWidth.bottom - lengthPx(parentStyle.padding.bottom, parent.width);
		x += parentStyle.borderWidth.left + lengthPx(parentStyle.padding.left, parent.width);
		y += stood === 'start' ? contentTop : contentBottom;
		placePositioned(box, padding, { x, y });
		this.outOfFlow.add(box);
		holder.children.push(box);
	}

	private layoutInFlow(draft: LayoutBoxBuilder, width: number, containing: Containing): void {
		const style = draft.style.layout;
		const padding = horizontalPadding(style, containing.width);
		draft.width = width;
		if (draft.kind === 'replaced' && draft.element?.replaced) {
			const size = sizeReplaced(draft.element.replaced, draft.style, containing.width);
			const top = style.borderWidth.top + lengthPx(style.padding.top, containing.width);
			draft.width = size.width + padding;
			draft.height = size.height + verticalPadding(style, containing.width);
			draft.baselines = { first: top + size.baseline, last: top + size.baseline };
			return;
		}
		const contentWidth = Math.max(0, width - padding);
		const definite = style.height !== 'auto' && style.height.percent === 0 ? lengthPx(style.height, 0) : null;
		const source = this.tree.inlineSource(draft);
		if (source) {
			const contentHeight = this.layoutFlow(draft, source, contentWidth);
			draft.height = blockHeight(style, contentHeight, width, containing);
			this.placeTrailingFloats(draft, contentWidth);
			return;
		}
		const context = formattingContextOf(draft);
		if (context) {
			// an aspect-ratio box has a definite height to center in (a title slide)
			const ratio =
				style.height === 'auto' && style.aspectRatio
					? Math.max(0, width / style.aspectRatio - verticalPadding(style, containing.width))
					: null;
			context(draft, draft.children, this.inputFor(contentWidth, definite ?? ratio));
			if (draft.kind === 'table') this.tables.keep(draft);
			const first = draft.baselines ? null : draft.children.find((child) => child.baselines);
			if (first) draft.baselines = { first: first.y + first.baselines!.first, last: first.y + first.baselines!.last };
			return;
		}
		draft.height = 0;
		const result = layoutBlockChildren(draft, draft.children, this.inputFor(contentWidth, definite));
		draft.height = blockHeight(style, result.contentHeight, width, containing);
		collapseOwnMargins(draft, result);
		const withBaselines = draft.children.filter((child) => child.baselines);
		const first = withBaselines[0];
		const last = withBaselines.at(-1);
		if (first && last) draft.baselines = { first: first.y + first.baselines!.first, last: last.y + last.baselines!.last };
	}

	/** a float generated after the content stands at its edge of the last line when it fits there, else under that line */
	private placeTrailingFloats(draft: LayoutBoxBuilder, contentWidth: number): void {
		const floats = this.tree.trailingFloatsOf(draft);
		if (!floats.length) return;
		const style = draft.style.layout;
		const left = style.borderWidth.left + lengthPx(style.padding.left, contentWidth);
		const top = style.borderWidth.top + lengthPx(style.padding.top, contentWidth);
		const line = draft.lines?.at(-1) ?? null;
		const used = line ? Math.max(left, ...line.fragments.map((fragment) => fragment.x + fragment.width)) : left;
		for (const box of floats) {
			const own = box.style.layout;
			const horizontal = blockWidth(own, contentWidth, () => this.intrinsic(box), true);
			box.margin = {
				top: verticalMargin(box.style, 'top', contentWidth),
				right: horizontal.marginRight,
				bottom: verticalMargin(box.style, 'bottom', contentWidth),
				left: horizontal.marginLeft
			};
			this.layoutBox(box, horizontal.width, { width: contentWidth, height: null });
			const outer = box.margin.left + box.width + box.margin.right;
			const fits = used + outer <= left + contentWidth + 1e-6;
			box.x = own.float === 'right' ? left + contentWidth - outer + box.margin.left : left + box.margin.left;
			box.y = (fits || !line ? (line?.y ?? top) : line.y + line.height) + box.margin.top;
			this.outOfFlow.add(box);
			draft.children.push(box);
		}
	}

	/** the box's lines, taken from the block's earlier layout when its node and their inputs are unchanged */
	private layoutFlow(draft: LayoutBoxBuilder, source: InlineFlowSource, contentWidth: number): number {
		const node = source.node ?? draft.node?.node ?? null;
		const offset = source.node ? source.offset : (draft.node?.offset ?? 0);
		// a first line shortened by a float is made for this layout alone
		if (!node || firstLineInset(draft)) return layoutInlineFlow(draft, source, this.flow, contentWidth);
		if (this.transient(node, offset, source.node !== null)) {
			this.transientNodes.add(node);
			return layoutInlineFlow(draft, source, this.flow, contentWidth);
		}
		const { styles } = this.request;
		const inputs = { width: contentWidth, style: draft.style, breaking: this.breakingKey, pieces: source.pieces };
		const reused = reuseFlow(this.earlier?.get(node), inputs, offset, styles);
		if (reused) {
			draft.lines = reused.lines;
			draft.baselines = reused.baselines;
			rememberFlow(this.flows, node, offset, inputs, reused, styles);
			return reused.contentHeight;
		}
		const contentHeight = layoutInlineFlow(draft, source, this.flow, contentWidth);
		rememberFlow(this.flows, node, offset, inputs, { lines: draft.lines!, baselines: draft.baselines, contentHeight }, styles);
		return contentHeight;
	}

	/** the word being typed or an input method's preedit is in the range, or the line breaking holds one of the paragraphs */
	private typing(from: number, to: number, textblocks: readonly PMNode[]): boolean {
		const { kept } = this.flow;
		if (!kept) return false;
		const { wholeWord, composition } = kept;
		if (wholeWord && wholeWord.from < to && wholeWord.to > from) return true;
		if (composition && composition.from < to && composition.to > from) return true;
		return textblocks.some((node) => kept.holds(node));
	}

	/** lines that hold a word being typed, an input method's preedit or kept breaks are made for this layout alone */
	private transient(node: PMNode, offset: number, textblock: boolean): boolean {
		const { kept, blockPos } = this.flow;
		if (!kept) return false;
		// a reused paragraph takes its kept breaks as a fresh one would, which settles it
		if (textblock && (kept.holds(node) || kept.take(node))) return true;
		const from = blockPos + offset;
		const to = from + node.nodeSize;
		return [kept.wholeWord, kept.composition].some((range) => !!range && range.from < to && range.to > from);
	}

	/** an atomic inline at its shrink-to-fit width, or a block-level object at the line's */
	private layoutObject(element: FaceElement, style: ComputedStyle, available: number): LayoutBoxBuilder {
		const box = this.tree.boxOf(element, style);
		if (this.turnsContent(element, style)) return this.layoutTurned(box, available);
		const blockLevel = isBlockLevel(style.layout);
		const horizontal = blockWidth(style.layout, available, () => this.intrinsic(box), !blockLevel);
		const vertical = style.layout.display === 'inline' && !element.replaced;
		box.margin = {
			top: vertical ? 0 : verticalMargin(style, 'top', available),
			right: horizontal.marginRight,
			bottom: vertical ? 0 : verticalMargin(style, 'bottom', available),
			left: horizontal.marginLeft
		};
		this.layoutBox(box, horizontal.width, { width: available, height: null });
		return box;
	}

	private turnsContent(element: FaceElement, style: ComputedStyle): boolean {
		const parent = element.parentNode instanceof FaceElement ? this.request.styles.styleOf(element.parentNode) : null;
		return turnsContent(style.layout, parent?.layout ?? null);
	}

	/** a vertical-rl atomic inline: its content laid out as one horizontal line, the box as tall as that line is long */
	private layoutTurned(draft: LayoutBoxBuilder, available: number): LayoutBoxBuilder {
		const { margin } = draft.style.layout;
		const wide = this.intrinsic(draft).max;
		draft.margin = {
			top: verticalMargin(draft.style, 'top', available),
			right: marginOf(margin.right),
			bottom: verticalMargin(draft.style, 'bottom', available),
			left: marginOf(margin.left)
		};
		this.layoutBox(draft, wide, { width: wide, height: null });
		[draft.width, draft.height] = [draft.height, draft.width];
		draft.baselines = null;
		return draft;
	}

	/** min-content and max-content border-box widths */
	intrinsic(box: LayoutBoxBuilder): { min: number; max: number } {
		if (box.kind !== 'cell') return this.measureBox(box);
		const known = this.tables.measuredOf(box);
		if (known) return known;
		const widths = this.measureBox(box);
		this.tables.measure(box, widths);
		return widths;
	}

	private measureBox(box: LayoutBoxBuilder): { min: number; max: number } {
		const style = box.style.layout;
		const padding = horizontalPadding(style, 0);
		if (style.width !== 'auto' && typeof style.width === 'object' && style.width.percent === 0) {
			const fixed = style.width.px + (style.boxSizing === 'border-box' ? 0 : padding);
			return { min: fixed, max: fixed };
		}
		if (box.kind === 'replaced' && box.element?.replaced) {
			const width = sizeReplaced(box.element.replaced, box.style, null).width + padding;
			// a percentage width or max-width lets it shrink to its container (css-sizing 5.2.2's compressible replaced elements)
			const compressible =
				(typeof style.width === 'object' && style.width.percent > 0) || (style.maxWidth !== 'none' && style.maxWidth.percent > 0);
			return { min: compressible ? 0 : width, max: width };
		}
		if (box.kind === 'flex') {
			const { min, max } = flexIntrinsicWidths(box, { intrinsic: (child) => this.intrinsic(child) });
			return { min: min + padding, max: max + padding };
		}
		if (box.kind === 'grid') {
			const { min, max } = gridIntrinsicWidths(box, { intrinsic: (child) => this.intrinsic(child) });
			return { min: min + padding, max: max + padding };
		}
		if (box.kind === 'table') return tableIntrinsicWidths(box, { intrinsic: (child) => this.intrinsic(child) });
		const source = this.tree.inlineSource(box);
		if (source) {
			const { min, max } = this.inlineIntrinsic(source);
			return { min: min + padding, max: max + padding };
		}
		let min = 0;
		let max = 0;
		for (const child of box.children) {
			const own = this.intrinsic(child);
			const margins = [child.style.layout.margin.left, child.style.layout.margin.right].reduce(
				(sum, m) => sum + (m === 'auto' ? 0 : m.px),
				0
			);
			min = Math.max(min, own.min + margins);
			max = Math.max(max, own.max + margins);
		}
		return { min: min + padding, max: max + padding };
	}

	private inlineIntrinsic(source: InlineFlowSource): { min: number; max: number } {
		const { pieces } = source;
		const widths = pieces.map((piece) => {
			if (piece.kind === 'generated') return measureRun(this.tools.measure, piece.run, piece.text) + piece.edges;
			if (piece.kind !== 'object') return 0;
			const own = this.intrinsic(this.tree.boxOf(piece.element, piece.style));
			return own.max;
		});
		const built = inlineItems(pieces, {
			measureText: (index, text) => {
				const piece = pieces[index];
				return piece.kind === 'text' ? measureRun(this.tools.measure, piece.run, text) : widths[index];
			},
			widthOf: (index) => widths[index],
			hyphenator: null,
			wholeWords: [],
			unbroken: null,
			splitWiderThan: Infinity,
			held: source.node !== null,
			textblockOffset: source.offset
		});
		let min = 0;
		let max = 0;
		let line = 0;
		let word = 0;
		for (const item of built.items) {
			if (item.kind === 'box') {
				word += item.width;
				line += item.width;
				continue;
			}
			min = Math.max(min, word);
			word = 0;
			if (item.kind === 'glue' && item.stretch < 1e5) line += item.width;
			if (item.kind === 'penalty' && item.cost === -Infinity) {
				max = Math.max(max, line);
				line = 0;
			}
		}
		// a box shrunk to its content holds it on the lines the breaking measures, slack and all
		return { min: Math.max(min, word) + LINE_FIT_SLACK, max: Math.max(max, line) + LINE_FIT_SLACK };
	}
}

/** a top-level block at the column width (CanvasEngine.layoutBlock with the window's measurer and metrics) */
export function layoutBlock(request: BlockLayoutRequest, tools: LayoutTools): BlockLayout {
	return new BlockLayouter(request, tools).layoutRoot();
}
