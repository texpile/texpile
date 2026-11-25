// column-count with balanced fill, for Typst #columns (5.1): pieces are runs of a paragraph's lines and whole boxes
import type { LayoutBoxBuilder, LayoutInput, LineBox, LineFragment } from '../../contracts/layoutTypes';
import { blockHeight, blockWidth, lengthPx } from '../blockFlow';
import { splitChunks, type ColumnPiece } from './columnPieces';

type Placement = { column: number; y: number };

function marginOf(value: number | 'auto'): number {
	return value === 'auto' ? 0 : value;
}

/** the columns the pieces fall into at this column height, or null when they need more than count of them */
export function fillColumns(pieces: readonly ColumnPiece[], count: number, height: number): Placement[] | null {
	const placed: Placement[] = [];
	let column = 0;
	let y = 0;
	for (const [i, piece] of pieces.entries()) {
		let gap = i === 0 ? piece.gapBefore : y > 0 ? piece.gapBefore : 0;
		if (y > 0 && y + gap + piece.height > height + 1e-6) {
			column++;
			y = 0;
			gap = 0;
		}
		if (column >= count) return null;
		y += gap;
		placed.push({ column, y });
		y += piece.height;
	}
	return placed;
}

/** the smallest column height that fits the pieces in count columns */
export function balancedHeight(pieces: readonly ColumnPiece[], count: number): number {
	let low = Math.max(0, ...pieces.map((piece) => piece.height));
	let high = pieces.reduce((sum, piece, i) => sum + piece.height + (i ? piece.gapBefore : 0), pieces[0]?.gapBefore ?? 0);
	if (low >= high) return high;
	for (let step = 0; step < 28; step++) {
		const middle = (low + high) / 2;
		if (fillColumns(pieces, count, middle)) high = middle;
		else low = middle;
	}
	return Math.ceil(high * 64 - 1e-4) / 64;
}

function shiftedFragment(fragment: LineFragment, dx: number, dy: number): LineFragment {
	if ((fragment.kind === 'atomic' || fragment.kind === 'widget') && fragment.box)
		return { ...fragment, x: fragment.x + dx, box: { ...fragment.box, x: fragment.box.x + dx, y: fragment.box.y + dy } };
	return { ...fragment, x: fragment.x + dx };
}

function movedLine(line: LineBox, dx: number, dy: number): LineBox {
	return {
		...line,
		y: line.y + dy,
		baseline: line.baseline + dy,
		textTop: line.textTop + dy,
		textBottom: line.textBottom + dy,
		fragments: line.fragments.map((fragment) => shiftedFragment(fragment, dx, dy)),
		hyphen: line.hyphen && { ...line.hyphen, x: line.hyphen.x + dx }
	};
}

type Run = { column: number; top: number; bottom: number };

/** puts a textblock's lines, cut into pieces, in the columns the pieces fell into */
function carryLines(draft: LayoutBoxBuilder, runs: readonly (ColumnPiece & Placement)[], columnX: (column: number) => number): void {
	const first = runs[0];
	const lines: LineBox[] = [];
	const columns: Run[] = [];
	for (const run of runs) {
		const dx = columnX(run.column) - columnX(first.column);
		const dy = run.y - first.y - run.start;
		for (let i = run.lines![0]; i < run.lines![1]; i++) lines.push(dx || dy ? movedLine(draft.lines![i], dx, dy) : draft.lines![i]);
		const top = run.y - first.y;
		const last = columns.at(-1);
		if (last && last.column === run.column) last.bottom = top + run.height;
		else columns.push({ column: run.column, top, bottom: top + run.height });
	}
	const own = columns[0];
	draft.lines = lines;
	draft.height = own.bottom;
	draft.continuations = columns.slice(1).map((run) => ({
		x: columnX(run.column) - columnX(first.column),
		y: run.top,
		width: draft.width,
		height: run.bottom - run.top
	}));
	const last = lines.at(-1)!;
	draft.baselines = { first: draft.baselines?.first ?? lines[0].baseline, last: last.baseline };
}

export function layoutColumns(draft: LayoutBoxBuilder, children: readonly LayoutBoxBuilder[], input: LayoutInput): void {
	const style = draft.style.layout;
	const count = Math.max(1, style.columns.count ?? 1);
	const gap = lengthPx(style.columns.gap, input.width);
	const columnWidth = Math.max(0, (input.width - gap * (count - 1)) / count);
	const left = style.borderWidth.left + lengthPx(style.padding.left, input.width);
	const top = style.borderWidth.top + lengthPx(style.padding.top, input.width);
	function columnX(column: number): number {
		return column * (columnWidth + gap);
	}
	for (const child of children) {
		const own = child.style.layout;
		const horizontal = blockWidth(own, columnWidth, () => input.intrinsic(child));
		child.margin = {
			top: marginOf(own.margin.top === 'auto' ? 'auto' : lengthPx(own.margin.top, columnWidth)),
			right: horizontal.marginRight,
			bottom: marginOf(own.margin.bottom === 'auto' ? 'auto' : lengthPx(own.margin.bottom, columnWidth)),
			left: horizontal.marginLeft
		};
		input.layout(child, horizontal.width);
	}
	const pieces = children.flatMap((child, index) => splitChunks(child, index, children[index - 1] ?? null));
	const fixed = style.columns.fill === 'auto' && input.height !== null;
	const columnHeight = fixed ? input.height! : balancedHeight(pieces, count);
	const placed = fillColumns(pieces, count, columnHeight) ?? pieces.map((): Placement => ({ column: 0, y: 0 }));
	const runs = pieces.map((piece, i) => ({ ...piece, ...placed[i] }));
	let bottom = 0;
	for (const [index, child] of children.entries()) {
		const own = runs.filter((run) => run.child === index);
		if (!own.length) continue;
		const first = own[0];
		child.x = left + columnX(first.column) + child.margin.left;
		child.y = top + first.y;
		if (own[0].lines) carryLines(child, own, (column) => columnX(column));
		for (const run of own) bottom = Math.max(bottom, run.y + run.height);
	}
	const last = children.at(-1);
	const trailing = last ? last.margin.bottom : 0;
	draft.height = blockHeight(style, Math.max(bottom + trailing, fixed ? columnHeight : 0), draft.width, {
		width: input.width,
		height: input.height
	});
}
