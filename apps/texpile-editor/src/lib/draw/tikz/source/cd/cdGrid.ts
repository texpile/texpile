import type { TextSpan } from '$lib/draw/editor/figure/figureLanguage';
import { splitItems } from '../options/optionList';
import type { CdArrowSpan, CdCell, CdGrid } from './cdGrid.types';

const BEGIN = '\\begin{tikzcd}';
const ARROW = /^\\(?:arrow|ar)(?![a-zA-Z])\s*\[/;

/** where the bracket opened at `at` closes, braces counted and a `]` in them skipped */
function bracketEnd(source: string, at: number, limit: number) {
	let depth = 0;
	for (let k = at; k < limit; k++) {
		const ch = source[k];
		if (ch === '\\') k++;
		else if (ch === '{') depth++;
		else if (ch === '}') depth--;
		else if (ch === ']' && depth === 0) return k + 1;
	}
	return -1;
}

/** the first stretch of a cell that is not an arrow, trimmed */
function textOf(source: string, from: number, to: number, arrows: CdArrowSpan[]): TextSpan | null {
	const gaps: TextSpan[] = [];
	let at = from;
	for (const a of arrows) {
		gaps.push({ from: at, to: a.from });
		at = a.to;
	}
	gaps.push({ from: at, to });
	for (const g of gaps) {
		const text = source.slice(g.from, g.to);
		const lead = text.length - text.trimStart().length;
		const trimmed = text.trim();
		if (trimmed) return { from: g.from + lead, to: g.from + lead + trimmed.length };
	}
	return null;
}

/** a tikzcd environment's rows and cells, at `from` in the source */
export function readGrid(source: string, from: number, to: number): CdGrid {
	const endFrom = to - '\\end{tikzcd}'.length;
	let bodyFrom = from + BEGIN.length;
	const ws = /^\s*/.exec(source.slice(bodyFrom))![0].length;
	let options: TextSpan | null = null;
	if (source[bodyFrom + ws] === '[') {
		const close = bracketEnd(source, bodyFrom + ws, endFrom);
		if (close > 0) {
			options = { from: bodyFrom + ws, to: close };
			bodyFrom = close;
		}
	}
	const replaced = options && splitItems(source.slice(options.from + 1, options.to - 1)).find((i) => /^ampersand replacement\s*=/.test(i));
	const separator = replaced ? replaced.replace(/^ampersand replacement\s*=\s*/, '').replace(/^\{(.*)\}$/, '$1') : '&';
	const rows: CdCell[][] = [[]];
	let arrows: CdArrowSpan[] = [];
	let cellFrom = bodyFrom;
	let depth = 0;
	function endCell(at: number) {
		const row = rows.at(-1)!;
		row.push({ r: rows.length, c: row.length + 1, from: cellFrom, to: at, text: textOf(source, cellFrom, at, arrows), arrows });
		arrows = [];
	}
	for (let k = bodyFrom; k < endFrom; k++) {
		const ch = source[k];
		if (ch === '%') {
			// a comment is no cell's text
			const eol = source.indexOf('\n', k);
			const until = eol < 0 || eol > endFrom ? endFrom : eol;
			arrows.push({ from: k, to: until, options: { from: until, to: until }, items: [] });
			k = until - 1;
		} else if (ch === '{') depth++;
		else if (ch === '}') depth--;
		else if (depth === 0 && source.startsWith(separator, k)) {
			endCell(k);
			cellFrom = k + separator.length;
			k += separator.length - 1;
		} else if (ch === '\\' && source[k + 1] === '\\' && depth === 0) {
			endCell(k);
			k += 2;
			// a row's own spacing, `\\[2em]`
			const gap = /^\s*\[/.exec(source.slice(k));
			if (gap) k = bracketEnd(source, k + gap[0].length - 1, endFrom);
			rows.push([]);
			cellFrom = k;
			k--;
		} else if (ch === '\\') {
			const arrow = depth === 0 ? ARROW.exec(source.slice(k, endFrom)) : null;
			const close = arrow ? bracketEnd(source, k + arrow[0].length - 1, endFrom) : -1;
			if (close > 0) {
				const options = { from: k + arrow![0].length, to: close - 1 };
				arrows.push({ from: k, to: close, options, items: splitItems(source.slice(options.from, options.to)) });
				k = close - 1;
			} else k++;
		}
	}
	endCell(endFrom);
	for (const row of rows) for (const cell of row) cell.arrows = cell.arrows.filter((a) => source[a.from] !== '%');
	return { options, bodyFrom, endFrom, separator, rows };
}

/** how far an arrow goes, in rows down and columns right: `r`, `dr`, `uul` */
export function arrowStep(items: string[]): [number, number] | null {
	const dir = items.find((i) => /^[rlud]+$/.test(i));
	if (!dir) return null;
	const steps = [...dir];
	function count(ch: string) {
		return steps.filter((d) => d === ch).length;
	}
	return [count('d') - count('u'), count('r') - count('l')];
}

export function stepText([dr, dc]: [number, number]) {
	return (dr < 0 ? 'u' : 'd').repeat(Math.abs(dr)) + (dc < 0 ? 'l' : 'r').repeat(Math.abs(dc));
}

export function cellAt(grid: CdGrid, r: number, c: number) {
	return grid.rows[r - 1]?.[c - 1] ?? null;
}

/** the cell an arrow points at */
export function arrowTarget(grid: CdGrid, from: CdCell, arrow: CdArrowSpan) {
	const step = arrowStep(arrow.items);
	return step ? { r: from.r + step[0], c: from.c + step[1] } : null;
}
