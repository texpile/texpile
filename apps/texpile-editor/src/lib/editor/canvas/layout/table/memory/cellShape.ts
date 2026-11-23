import type { LayoutBoxBuilder, LineBox } from '../../../contracts/layoutTypes';
import type { LayoutStyle } from '../../../contracts/styleTypes';

/** the line room a width change must leave at the end of the longest line */
const ROOM = 1;

const PLAIN_FRAGMENTS: ReadonlySet<string> = new Set(['text', 'edge', 'hyphen', 'generated']);

function exact(length: { px: number; percent: number }): boolean {
	return length.percent === 0;
}

function noLength(length: 'auto' | { px: number; percent: number }): boolean {
	return length === 'auto' || (length.px === 0 && length.percent === 0);
}

/** a box in a cell's block flow that is as wide as the room it stands in */
function fills(style: LayoutStyle): boolean {
	const { margin, padding } = style;
	return (
		style.width === 'auto' &&
		noLength(style.minWidth) &&
		style.maxWidth === 'none' &&
		style.height === 'auto' &&
		(style.minHeight === 'auto' || exact(style.minHeight)) &&
		style.maxHeight === 'none' &&
		!style.aspectRatio &&
		margin.left !== 'auto' &&
		margin.right !== 'auto' &&
		exact(margin.left) &&
		exact(margin.right) &&
		exact(padding.left) &&
		exact(padding.right)
	);
}

/** the last line of a paragraph sits at its start whatever the paragraph's text-align asks of the lines above it */
function startAligned(style: LayoutStyle, line: LineBox): boolean {
	const { textAlign, textAlignLast } = style;
	const last = textAlignLast === 'auto' || textAlignLast === 'start' || textAlignLast === 'left';
	return (
		style.direction === 'ltr' &&
		style.writingMode === 'horizontal-tb' &&
		!line.justified &&
		(textAlign === 'start' || textAlign === 'left' || (textAlign === 'justify' && last)) &&
		exact(style.textIndent) &&
		style.textOverflow === 'clip' &&
		style.lineClamp === null
	);
}

function plainLines(lines: readonly LineBox[]): boolean {
	return lines.every((line) => line.fragments.every((fragment) => PLAIN_FRAGMENTS.has(fragment.kind)));
}

/** what a box in a cell lets the cell's width change; null when its lines wrap or its width is not the room's */
function leastRoom(box: LayoutBoxBuilder, cell: boolean): number | null {
	const style = box.style.layout;
	if (!cell && !fills(style)) return null;
	if (style.padding.left.percent !== 0 || style.padding.right.percent !== 0) return null;
	let least = -Infinity;
	const lines = box.lines ?? [];
	if (lines.length > 1 || (lines.length && !startAligned(style, lines[0]))) return null;
	if (lines.length) {
		const extent = Math.max(0, ...lines[0].fragments.map((fragment) => fragment.x + fragment.width));
		const edge = box.width - style.borderWidth.right - style.padding.right.px;
		least = ROOM - (edge - extent);
	}
	for (const child of box.children) {
		const room = leastRoom(child, false);
		if (room === null) return null;
		least = Math.max(least, room);
	}
	return least;
}

/** a cell built of plain blocks and text: null when anything else is in it (an inline box, a float, a table, an absolute box) */
function plainBox(box: LayoutBoxBuilder, cell: boolean): boolean {
	const style = box.style.layout;
	if (box.kind !== (cell ? 'cell' : box.kind === 'anonymous' ? 'anonymous' : 'block')) return false;
	if (style.position === 'absolute' || style.float !== 'none' || style.columns.count !== null || style.transform) return false;
	if (box.scroll || box.continuations || (box.lines && !plainLines(box.lines))) return false;
	return box.children.every((child) => plainBox(child, false));
}

export type CellShape = {
	/** the narrowest width the cell keeps its lines at, or null when only the width it was laid out at keeps them */
	readonly minWidth: number | null;
};

export function shapeOf(box: LayoutBoxBuilder): CellShape | null {
	if (!plainBox(box, true)) return null;
	const room = leastRoom(box, true);
	return { minWidth: room === null ? null : box.width + room };
}

/** the children at a width `delta` wider: boxes as wide as the room they stand in follow it, their lines stay */
export function widenedChildren(children: readonly LayoutBoxBuilder[], delta: number): LayoutBoxBuilder[] {
	return children.map((child) => ({ ...child, width: child.width + delta, children: widenedChildren(child.children, delta) }));
}
