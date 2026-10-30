import { applyTextEdits, indentAt, texText, type TextEdit } from '../sourceText';
import { readArrow } from './cdArrows';
import { arrowStep, arrowTarget, cellAt, readGrid, stepText } from './cdGrid';
import type { CdArrowSpan, CdCell, CdGrid } from './cdGrid.types';

const END = '\\end{tikzcd}';

/** the diagram around a position in the source */
export function gridAround(source: string, pos: number) {
	const from = source.lastIndexOf('\\begin{tikzcd}', pos);
	const end = source.indexOf(END, pos);
	return from < 0 || end < 0 ? null : { from, grid: readGrid(source, from, end + END.length) };
}

/** typed text for a cell, where `ampersand replacement` can make `\&` the next cell */
export function cellText(text: string, separator: string) {
	const written = texText(text, true);
	return separator === '&' ? written : written.replace(/\\&/g, '\\mathchar"0026 ');
}

function applyEdits(source: string, edits: TextEdit[]) {
	return applyTextEdits(source, edits).source;
}

/** a span taken out with the spaces before it */
function cut(source: string, start: number, to: number): TextEdit {
	let from = start;
	while (from > 0 && (source[from - 1] === ' ' || source[from - 1] === '\t')) from--;
	return { from, to, text: '' };
}

function blank(source: string, cell: CdCell) {
	return !cell.text && !cell.arrows.length && !source.slice(cell.from, cell.to).trim();
}
function rowBlank(source: string, row: CdCell[]) {
	return row.every((c) => blank(source, c));
}

/** where a cell's content ends, its arrows counted; its start when it has none */
function contentEnd(source: string, cell: CdCell) {
	const text = source.slice(cell.from, cell.to);
	return cell.from + text.trimEnd().length;
}

function indentOf(source: string, grid: CdGrid) {
	const first = grid.rows.flat().find((c) => c.text);
	if (!first) return '  ';
	return indentAt(source, first.text!.from);
}

/** an empty row or column added where (r, c) is outside the grid; the cells it moves are given back moved too */
function growTo(original: string, from: number, r: number, c: number) {
	let source = original;
	let { grid } = gridAround(source, from + 1)!;
	const shift: [number, number] = [0, 0];
	if (c < 1) {
		const edits = grid.rows
			.filter((row) => !rowBlank(source, row))
			.map((row) => {
				const at = row[0].from + (source.slice(row[0].from).length - source.slice(row[0].from).trimStart().length);
				return { from: at, to: at, text: `${grid.separator} ` };
			});
		source = applyEdits(source, edits);
		shift[1] = 1 - c;
		grid = gridAround(source, from + 1)!.grid;
	}
	const indent = indentOf(source, grid);
	if (r < 1) {
		const first = grid.rows[0][0];
		const at = first.from + (source.slice(first.from).length - source.slice(first.from).trimStart().length);
		source = applyEdits(source, [{ from: at, to: at, text: `\\\\\n${indent}` }]);
		shift[0] = 1 - r;
	} else if (r > grid.rows.length && !rowBlank(source, grid.rows.at(-1)!)) {
		const at = contentEnd(source, grid.rows.at(-1)!.at(-1)!);
		source = applyEdits(source, [{ from: at, to: at, text: ` \\\\\n${indent}` }]);
	}
	return { source, shift, grid: gridAround(source, from + 1)!.grid };
}

/** text put in at (r, c) of the grid, a row that exists, with the `&`s it needs */
function placement(source: string, grid: CdGrid, r: number, c: number, text: string): TextEdit {
	const row = grid.rows[Math.min(r, grid.rows.length) - 1];
	if (rowBlank(source, row)) {
		const at = row[0].from + /^[ \t]*\n?[ \t]*/.exec(source.slice(row[0].from, row[0].to))![0].length;
		const after = /\s/.test(source[at]) ? '' : ' ';
		return { from: at, to: at, text: `${grid.separator} `.repeat(c - 1) + text + after };
	}
	if (c > row.length) {
		const at = contentEnd(source, row.at(-1)!);
		return { from: at, to: at, text: `${` ${grid.separator}`.repeat(c - row.length)} ${text}` };
	}
	const cell = row[c - 1];
	const lead = source.slice(cell.from, cell.to).length - source.slice(cell.from, cell.to).trimStart().length;
	const at = cell.from + lead;
	const before = /\s/.test(source[at - 1]) ? '' : ' ';
	const after = /\s/.test(source[at]) ? '' : ' ';
	return { from: at, to: at, text: `${before}${text}${after}` };
}

/** a new cell at (r, c); a row or column past the grid's edges, 0 or one past the last, is added for it */
export function addCell(source: string, from: number, r: number, c: number, text: string) {
	const grown = growTo(source, from, r, c);
	const edit = placement(grown.source, grown.grid, r + grown.shift[0], c + grown.shift[1], text);
	return { source: applyEdits(grown.source, [edit]), at: edit.from + edit.text.indexOf(text) };
}

function arrowWith(source: string, a: CdArrowSpan, step: [number, number]) {
	const items = a.items.map((i) => (/^[rlud]+$/.test(i) ? stepText(step) : i));
	return `${source.slice(a.from, a.options.from)}${items.join(', ')}${source.slice(a.options.to, a.to)}`;
}

/** the cell's text and its arrows moved to (r, c), its arrows and the arrows to it still meeting the same cells */
export function moveCell(source: string, from: number, textFrom: number, r: number, c: number) {
	const before = gridAround(source, from + 1)!.grid;
	const old = before.rows.flat().find((cell) => cell.text?.from === textFrom);
	if (!old || (old.r === r && old.c === c)) return null;
	if (cellAt(before, r, c)?.text) return null;
	const grown = growTo(source, from, r, c);
	const grid = grown.grid;
	const [sr, sc] = grown.shift;
	const moving = cellAt(grid, old.r + sr, old.c + sc)!;
	const [tr, tc] = [r + sr, c + sc];
	const text = grown.source;
	const edits: TextEdit[] = [];
	for (const cell of grid.rows.flat()) {
		if (cell === moving) continue;
		for (const a of cell.arrows) {
			const target = arrowTarget(grid, cell, a);
			if (target?.r === moving.r && target.c === moving.c)
				edits.push({ from: a.from, to: a.to, text: arrowWith(text, a, [tr - cell.r, tc - cell.c]) });
		}
	}
	const carried = moving.arrows.map((a) => {
		const step = arrowStep(a.items);
		return step ? arrowWith(text, a, [moving.r + step[0] - tr, moving.c + step[1] - tc]) : text.slice(a.from, a.to);
	});
	edits.push(cut(text, moving.text!.from, moving.text!.to), ...moving.arrows.map((a) => cut(text, a.from, a.to)));
	const content = [text.slice(moving.text!.from, moving.text!.to), ...carried].join(' ');
	const place = placement(text, grid, tr, tc, content);
	// where the text lands once everything before it has been taken out or rewritten
	const shift = edits.filter((e) => e.to <= place.from).reduce((n, e) => n + e.text.length - (e.to - e.from), 0);
	edits.push(place);
	return { source: applyEdits(text, edits), at: place.from + shift + place.text.indexOf(content) };
}

/** an arrow from one cell's statement to another's, written last in the first */
export function addArrow(source: string, from: number, fromText: number, toText: number) {
	const { grid } = gridAround(source, from + 1)!;
	const cells = grid.rows.flat();
	const a = cells.find((cell) => cell.text?.from === fromText);
	const b = cells.find((cell) => cell.text?.from === toText);
	if (!a || !b || a === b) return null;
	const at = Math.max(a.text!.to, ...a.arrows.map((x) => x.to));
	const arrow = `\\arrow[${stepText([b.r - a.r, b.c - a.c])}]`;
	return { source: source.slice(0, at) + ' ' + arrow + source.slice(at), at: at + 1 };
}

/** the arrow's start (k = 0), written in the cell it leaves, or its end (k = 1), moved to another cell's text */
export function pointArrow(source: string, arrowFrom: number, k: 0 | 1, toText: number) {
	const found = gridAround(source, arrowFrom);
	const cells = found?.grid.rows.flat() ?? [];
	const own = cells.find((c) => c.arrows.some((a) => a.from === arrowFrom));
	const onto = cells.find((c) => c.text?.from === toText);
	const a = own?.arrows.find((x) => x.from === arrowFrom);
	const target = own && a && arrowTarget(found!.grid, own, a);
	// onto a cell it already meets is no move, or a loop
	if (!own || !onto || !a || !target || onto === own || (onto.r === target.r && onto.c === target.c)) return null;
	if (k === 1) {
		const text = arrowWith(source, a, [onto.r - own.r, onto.c - own.c]);
		return { source: applyEdits(source, [{ from: a.from, to: a.to, text }]), at: a.from };
	}
	const at = Math.max(onto.text!.to, ...onto.arrows.map((x) => x.to));
	const removed = cut(source, a.from, a.to);
	const text = ` ${arrowWith(source, a, [target.r - onto.r, target.c - onto.c])}`;
	const next = applyEdits(source, [removed, { from: at, to: at, text }]);
	return { source: next, at: at + 1 - (removed.to <= at ? removed.to - removed.from : 0) };
}

/** a cell's text taken out with the arrows from it and to it */
export function removeCell(source: string, textFrom: number) {
	const found = gridAround(source, textFrom);
	const cell = found?.grid.rows.flat().find((x) => x.text?.from === textFrom);
	if (!found || !cell) return source;
	const edits = [cut(source, cell.text!.from, cell.text!.to), ...cell.arrows.map((a) => cut(source, a.from, a.to))];
	for (const other of found.grid.rows.flat())
		for (const a of other.arrows) {
			const t = other === cell ? null : arrowTarget(found.grid, other, a);
			if (t?.r === cell.r && t.c === cell.c) edits.push(cut(source, a.from, a.to));
		}
	return applyEdits(source, edits);
}

export function removeArrow(source: string, arrowFrom: number) {
	const found = gridAround(source, arrowFrom);
	const a = found?.grid.rows
		.flat()
		.flatMap((x) => x.arrows)
		.find((x) => x.from === arrowFrom);
	return a ? applyEdits(source, [cut(source, a.from, a.to)]) : source;
}

/** the arrow's options as `items` */
export function writeArrowItems(source: string, arrowFrom: number, items: string[]) {
	const found = gridAround(source, arrowFrom);
	const a = found?.grid.rows
		.flat()
		.flatMap((x) => x.arrows)
		.find((x) => x.from === arrowFrom);
	return a ? source.slice(0, a.options.from) + items.join(', ') + source.slice(a.options.to) : null;
}

export function arrowAt(source: string, arrowFrom: number) {
	return (
		gridAround(source, arrowFrom)
			?.grid.rows.flat()
			.flatMap((x) => x.arrows)
			.find((x) => x.from === arrowFrom) ?? null
	);
}

/** an arrow as the cells it joins, and its label: `f: A → B` */
export function arrowName(source: string, arrowFrom: number) {
	const found = gridAround(source, arrowFrom);
	const from = found?.grid.rows.flat().find((c) => c.arrows.some((a) => a.from === arrowFrom));
	const arrow = from?.arrows.find((a) => a.from === arrowFrom);
	if (!found || !from || !arrow) return null;
	const target = arrowTarget(found.grid, from, arrow);
	const to = target && cellAt(found.grid, target.r, target.c);
	function text(c: typeof from | null) {
		return c?.text ? source.slice(c.text.from, c.text.to).replace(/\s+/g, ' ') : '·';
	}
	const label = readArrow(arrow).label;
	return `${label ? `${label}: ` : ''}${text(from)} → ${text(to)}`;
}
