// the canvas's own answer to a click, judged on its own layout: on the line nearest the click and the nearest caret there
export type CaretRect = { pos: number; left: number; top: number; bottom: number; textblock: number; chain: string };
export type CellAnswer = {
	click: { x: number; y: number };
	pos: number | null;
	rect: CaretRect | null;
	/** the textblock holding the answer: its type, content range and the first line's top */
	textblock: { type: string; start: number; end: number; firstTop: number } | null;
	inIsland: boolean;
	/** an answer between nodes (not in a textblock): the vertical extent of the nodes on its two sides */
	boundary: { top: number; bottom: number } | null;
	/** the vertical extent of the top-level block holding the answer */
	block: { top: number; bottom: number } | null;
};
export type Verdict = { ok: true } | { ok: false; why: string };

export const SAME_PX = 1;
/** two lines this close to the click are a tie: caret rects are rounded to the layout's pixel grid */
const TIE_PX = 0.5;

/** a line of a textblock: its carets and the union of their vertical extents */
export type CaretLine = { textblock: number; top: number; bottom: number; carets: CaretRect[]; chain: string };

/** two lines that touch share an edge, which offsets summed in another order put a few bits either side of */
const EDGE_PX = 0.01;

/** the carets of a screen grouped into lines: those of one textblock whose vertical extents overlap */
export function linesOf(carets: readonly CaretRect[]): CaretLine[] {
	const lines: CaretLine[] = [];
	const byTextblock = Map.groupBy(carets, (caret) => caret.textblock);
	for (const [textblock, members] of byTextblock) {
		const sorted = members.toSorted((a, b) => a.top - b.top);
		let line: CaretLine | null = null;
		for (const caret of sorted) {
			if (line && caret.top < line.bottom - EDGE_PX) {
				line.bottom = Math.max(line.bottom, caret.bottom);
				line.carets.push(caret);
			} else lines.push((line = { textblock, top: caret.top, bottom: caret.bottom, carets: [caret], chain: caret.chain }));
		}
	}
	return lines;
}

function gap(line: CaretLine, y: number): number {
	return Math.max(0, line.top - y, y - line.bottom);
}

/** the answer's line holds the click within SAME_PX or is the line nearest to it, and no caret of that line is nearer to the click */
export function judgeAnswer(answer: CellAnswer, lines: readonly CaretLine[]): Verdict {
	const { rect, click, boundary, block } = answer;
	// hit rule 5: a click inside a block answers from that block's own lines first
	const inside =
		block && click.y >= block.top && click.y < block.bottom
			? lines.filter((line) => line.top >= block.top - EDGE_PX && line.bottom <= block.bottom + EDGE_PX)
			: [];
	const pool = inside.length ? inside : lines;
	const nearest = Math.min(...pool.map((line) => gap(line, click.y)));
	if (boundary) {
		const reach = Math.max(0, boundary.top - click.y, click.y - boundary.bottom);
		return reach <= Math.max(SAME_PX, nearest + TIE_PX)
			? { ok: true }
			: { ok: false, why: `boundary ${reach.toFixed(1)} px from the click, nearest line ${nearest.toFixed(1)}` };
	}
	if (!rect) return { ok: false, why: 'no caret at the answer' };
	const own = lines.find(
		(line) => line.textblock === rect.textblock && rect.top < line.bottom - EDGE_PX && line.top < rect.bottom - EDGE_PX
	);
	if (!own) return { ok: false, why: 'the answer stands on no line of its textblock' };
	const reach = gap(own, click.y);
	if (reach > Math.max(SAME_PX, nearest + TIE_PX)) {
		const closer = pool.find((line) => gap(line, click.y) === nearest);
		return {
			ok: false,
			why: `line in ${own.chain} ${reach.toFixed(1)} px from the click, nearest ${nearest.toFixed(1)} in ${closer?.chain}`
		};
	}
	const best = Math.min(...own.carets.map((caret) => Math.abs(caret.left - click.x)));
	if (Math.abs(rect.left - click.x) > best + SAME_PX)
		return {
			ok: false,
			why: `caret ${Math.abs(rect.left - click.x).toFixed(1)} px from the click, nearest on its line ${best.toFixed(1)}`
		};
	return { ok: true };
}

/** the cells the decision "a click beside a line" moved: P0 answered the textblock's start, this canvas the nearest position */
export type DecidedCell = 'aboveFirstLine' | 'rightOfHeading';

/** by geometry: the click is above the first line of the answer's textblock and the answer is on that line, or right of the answer's heading line */
export function decidedCell(answer: CellAnswer): DecidedCell | null {
	const { textblock, rect, click } = answer;
	if (!textblock || !rect) return null;
	if (click.y < textblock.firstTop - SAME_PX && Math.abs(rect.top - textblock.firstTop) <= SAME_PX) return 'aboveFirstLine';
	const onLine = click.y >= rect.top - SAME_PX && click.y <= rect.bottom + SAME_PX;
	return onLine && click.x > rect.left + SAME_PX && /heading|title|section/i.test(textblock.type) ? 'rightOfHeading' : null;
}
