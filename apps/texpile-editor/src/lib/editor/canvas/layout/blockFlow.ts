// display block, flow-root and list-item (5.1, 5.2)
import type { LayoutBoxBuilder, LayoutInput } from '../contracts/layoutTypes';
import type { Length, LayoutStyle } from '../contracts/styleTypes';
import { createFloatArea, firstLineInset, insetFirstLine, runsIn, type FirstLineInset, type FloatArea } from './floats';
import {
	adjoin,
	collapsesWithFirstChild,
	collapsesWithLastChild,
	marginOf,
	NO_MARGIN,
	resolveMargin,
	type CollapsedMargin
} from './marginCollapse';

export type HorizontalBox = { readonly width: number; readonly marginLeft: number; readonly marginRight: number };
export type BlockChildrenResult = {
	readonly contentHeight: number;
	/** the margin that collapsed through the box's top or bottom edge, for the box's own margin; null when it stays inside */
	readonly throughTop: CollapsedMargin | null;
	readonly throughBottom: CollapsedMargin | null;
	/** no child took room: the box's own margins collapse through it when it has no height */
	readonly empty: boolean;
};

/** boxes with no height, border, padding or lines, whose top and bottom margins adjoin (8.3.1) */
export const collapsedThrough = new WeakSet<LayoutBoxBuilder>();

export function lengthPx(length: Length, of: number): number {
	return length.px + (length.percent / 100) * of;
}

export function horizontalPadding(style: LayoutStyle, containing: number): number {
	return (
		style.borderWidth.left + style.borderWidth.right + lengthPx(style.padding.left, containing) + lengthPx(style.padding.right, containing)
	);
}

export function verticalPadding(style: LayoutStyle, containing: number): number {
	return (
		style.borderWidth.top + style.borderWidth.bottom + lengthPx(style.padding.top, containing) + lengthPx(style.padding.bottom, containing)
	);
}

function asBorderBox(style: LayoutStyle, value: number, padding: number): number {
	return style.boxSizing === 'border-box' ? value : value + padding;
}

function clampWidth(style: LayoutStyle, width: number, containing: number, padding: number): number {
	let clamped = width;
	if (style.maxWidth !== 'none') clamped = Math.min(clamped, asBorderBox(style, lengthPx(style.maxWidth, containing), padding));
	if (style.minWidth !== 'auto') clamped = Math.max(clamped, asBorderBox(style, lengthPx(style.minWidth, containing), padding));
	return Math.max(clamped, padding);
}

/** border-box width and horizontal margins (10.3.3); shrinks: a float or an atomic inline fits its content (10.3.5) */
export function blockWidth(
	style: LayoutStyle,
	containing: number,
	intrinsic: () => { min: number; max: number },
	shrinks = false
): HorizontalBox {
	const padding = horizontalPadding(style, containing);
	const left = style.margin.left === 'auto' ? null : lengthPx(style.margin.left, containing);
	const right = style.margin.right === 'auto' ? null : lengthPx(style.margin.right, containing);
	const available = containing - (left ?? 0) - (right ?? 0);
	const { width } = style;
	// a block-level table is as wide as its columns ask, its auto margins still centering it (17.4)
	const fits = shrinks || style.display === 'table';
	let used: number;
	if (width === 'auto' && !fits) used = available;
	else if (width === 'auto' || width === 'fit-content') {
		const { min, max } = intrinsic();
		used = Math.min(Math.max(min, available), max);
	} else if (width === 'min-content' || width === 'max-content') used = intrinsic()[width === 'min-content' ? 'min' : 'max'];
	else used = lengthPx(width, containing) + (style.boxSizing === 'border-box' ? 0 : padding);
	used = clampWidth(style, used, containing, padding);
	const room = containing - used - (left ?? 0) - (right ?? 0);
	if (left === null && right === null && !shrinks)
		return { width: used, marginLeft: Math.max(0, room / 2), marginRight: Math.max(0, room / 2) };
	if (left === null && !shrinks) return { width: used, marginLeft: Math.max(0, room), marginRight: right! };
	return { width: used, marginLeft: left ?? 0, marginRight: right ?? Math.max(0, shrinks ? 0 : room) };
}

/** the border-box height from the content height (10.6.3), with a definite height, aspect-ratio and min and max */
export function blockHeight(
	style: LayoutStyle,
	contentHeight: number,
	width: number,
	containing: { width: number; height: number | null }
): number {
	const padding = verticalPadding(style, containing.width);
	let height = contentHeight + padding;
	if (style.height !== 'auto' && (style.height.percent === 0 || containing.height !== null))
		height = asBorderBox(style, lengthPx(style.height, containing.height ?? 0), padding);
	else if (style.aspectRatio) height = Math.max(height, width / style.aspectRatio);
	if (style.maxHeight !== 'none' && (style.maxHeight.percent === 0 || containing.height !== null))
		height = Math.min(height, asBorderBox(style, lengthPx(style.maxHeight, containing.height ?? 0), padding));
	if (style.minHeight !== 'auto' && (style.minHeight.percent === 0 || containing.height !== null))
		height = Math.max(height, asBorderBox(style, lengthPx(style.minHeight, containing.height ?? 0), padding));
	return Math.max(height, padding);
}

function verticalMargin(style: LayoutStyle, side: 'top' | 'bottom', containing: number): number {
	const margin = style.margin[side];
	return margin === 'auto' ? 0 : lengthPx(margin, containing);
}

/** places in-flow block children down the content box, and floats that run in beside them; each child's own collapsed
 *  margins are on child.margin after layout */
export function layoutBlockChildren(
	draft: LayoutBoxBuilder,
	children: readonly LayoutBoxBuilder[],
	input: LayoutInput
): BlockChildrenResult {
	const style = draft.style.layout;
	const contentLeft = style.borderWidth.left + lengthPx(style.padding.left, input.width);
	const contentTop = style.borderWidth.top + lengthPx(style.padding.top, input.width);
	// input.width is the content box: the children's containing block
	const contentWidth = input.width;
	const topThrough = collapsesWithFirstChild(style);
	const inherited = firstLineInset(draft);
	let floats: FloatArea | null = null;
	let y = contentTop;
	let pending = NO_MARGIN;
	let placedAny = false;
	let throughTop: CollapsedMargin | null = null;
	/** what the floats, and the room the box's own first line lost, take from a child's first line */
	function insetOf(child: LayoutBoxBuilder): FirstLineInset {
		const childStyle = child.style.layout;
		const top = y - contentTop + (placedAny || !topThrough ? resolveMargin(adjoin(pending, marginOf(child.margin.top))) : 0);
		const lineTop = top + childStyle.borderWidth.top + lengthPx(childStyle.padding.top, contentWidth);
		const leftEdge = child.margin.left + childStyle.borderWidth.left + lengthPx(childStyle.padding.left, contentWidth);
		const rightEdge = child.margin.right + childStyle.borderWidth.right + lengthPx(childStyle.padding.right, contentWidth);
		const room = floats?.lineWidths(lineTop, 1) ?? { left: 0, right: contentWidth };
		let left = room.left - leftEdge;
		let right = contentWidth - room.right - rightEdge;
		if (inherited && !placedAny && lineTop <= 0) {
			left = Math.max(left, inherited.left - leftEdge);
			right = Math.max(right, inherited.right - rightEdge);
		}
		return { left: Math.max(0, left), right: Math.max(0, right) };
	}
	for (const child of children) {
		const childStyle = child.style.layout;
		const floated = childStyle.float !== 'none';
		const horizontal = blockWidth(childStyle, contentWidth, () => input.intrinsic(child), floated);
		child.margin = {
			top: verticalMargin(childStyle, 'top', contentWidth),
			right: horizontal.marginRight,
			bottom: verticalMargin(childStyle, 'bottom', contentWidth),
			left: horizontal.marginLeft
		};
		if (!floated) insetFirstLine(child, insetOf(child));
		input.layout(child, horizontal.width);
		// a taller float stays in the flow until the lines beside it are shortened past the first (W5)
		if (childStyle.float !== 'none' && runsIn(child)) {
			floats ??= createFloatArea(contentWidth);
			floats.place(child, childStyle.float, y - contentTop + (placedAny ? resolveMargin(pending) : 0));
			child.x += contentLeft;
			child.y += contentTop;
			continue;
		}
		child.x = contentLeft + child.margin.left;
		pending = adjoin(pending, marginOf(child.margin.top));
		if (collapsedThrough.has(child)) {
			pending = adjoin(pending, marginOf(child.margin.bottom));
			child.y = y;
			continue;
		}
		if (!placedAny && topThrough) {
			throughTop = pending;
			child.y = y;
		} else child.y = y + resolveMargin(pending);
		y = child.y + child.height;
		pending = marginOf(child.margin.bottom);
		placedAny = true;
	}
	const result = flowResult(style, { y, contentTop, pending, placedAny, topThrough, throughTop });
	return floats ? { ...result, contentHeight: Math.max(result.contentHeight, floats.bottom()) } : result;
}

type FlowEnd = {
	y: number;
	contentTop: number;
	pending: CollapsedMargin;
	placedAny: boolean;
	topThrough: boolean;
	throughTop: CollapsedMargin | null;
};

function flowResult(style: LayoutStyle, end: FlowEnd): BlockChildrenResult {
	const { y, contentTop, pending, placedAny, topThrough, throughTop } = end;
	const bottomThrough = collapsesWithLastChild(style);
	if (!placedAny) {
		if (topThrough) return { contentHeight: 0, throughTop: pending, throughBottom: null, empty: bottomThrough };
		if (bottomThrough) return { contentHeight: 0, throughTop: null, throughBottom: pending, empty: false };
		return { contentHeight: resolveMargin(pending), throughTop: null, throughBottom: null, empty: false };
	}
	if (bottomThrough) return { contentHeight: y - contentTop, throughTop, throughBottom: pending, empty: false };
	return { contentHeight: y + resolveMargin(pending) - contentTop, throughTop, throughBottom: null, empty: false };
}

/** the box's own margins after its children's collapsed through its edges */
export function collapseOwnMargins(draft: LayoutBoxBuilder, result: BlockChildrenResult): void {
	if (result.throughTop) draft.margin.top = resolveMargin(adjoin(marginOf(draft.margin.top), result.throughTop));
	if (result.throughBottom) draft.margin.bottom = resolveMargin(adjoin(marginOf(draft.margin.bottom), result.throughBottom));
	if (result.empty && draft.height === 0) {
		const through = resolveMargin(adjoin(marginOf(draft.margin.top), marginOf(draft.margin.bottom)));
		draft.margin.top = through;
		draft.margin.bottom = 0;
		collapsedThrough.add(draft);
	}
}
