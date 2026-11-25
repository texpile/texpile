// what a column break may fall between: a paragraph's lines (two stay on each side of a break) and whole boxes
import type { LayoutBoxBuilder } from '../../contracts/layoutTypes';

export type ColumnPiece = {
	readonly child: number;
	/** the child's lines [from, to) this piece holds, or null for the whole box */
	readonly lines: readonly [number, number] | null;
	/** the extent in the child's border box */
	readonly start: number;
	readonly height: number;
	/** the margin above the child's first piece, collapsed with the sibling before it */
	readonly gapBefore: number;
};

const ORPHANS = 2;
const WIDOWS = 2;

export function splitChunks(child: LayoutBoxBuilder, index: number, before: LayoutBoxBuilder | null): ColumnPiece[] {
	const gapBefore = before ? Math.max(before.margin.bottom, child.margin.top) : child.margin.top;
	const { lines } = child;
	if (!lines || child.children.length || lines.length < ORPHANS + WIDOWS)
		return [{ child: index, lines: null, start: 0, height: child.height, gapBefore }];
	const cuts = [0, ...Array.from({ length: lines.length - ORPHANS - WIDOWS + 1 }, (_, i) => ORPHANS + i), lines.length];
	return cuts.slice(0, -1).map((from, i) => {
		const to = cuts[i + 1];
		const start = from === 0 ? 0 : lines[from].y;
		const end = to === lines.length ? child.height : lines[to].y;
		return { child: index, lines: [from, to] as const, start, height: end - start, gapBefore: i === 0 ? gapBefore : 0 };
	});
}
