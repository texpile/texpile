// the rules LaTeX prints around each cell of a table: from the column spec, the rules written between the rows, and a
// multicolumn's own spec. A table the editor made has no spec yet and is saved with every rule (tableSerializer)
import type { Node } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { heavierRule as heavier, type CellAlign, type CellEdges, type RuleWeight, type TableLook } from '$lib/languages/latex/visual/core';

export type SpecColumns = { bars: boolean[]; letters: string[] };

const HEAVY = new Set(['toprule', 'bottomrule', 'Xhline', 'specialrule', 'thickhline', 'heavyrule']);
const LIGHT = new Set(['hline', 'midrule', 'hhline', 'hdashline', 'firsthline', 'lasthline', 'tabucline']);
const PARTIAL = new Set(['cline', 'cmidrule', 'cdashline']);

/** for each column, the rule `source` draws across it; `source` is what stands between two rows, such as \hline or \cmidrule(lr){2-3} */
export function horizontalRule(source: string, columns: number): (RuleWeight | null)[] {
	const across: (RuleWeight | null)[] = Array.from({ length: columns }, () => null);
	let full: RuleWeight | null = null;
	let hlines = 0;
	for (const found of source.matchAll(/\\([A-Za-z]+)(?:\s*\([^)]*\))?(?:\s*\[[^\]]*\])?(?:\s*\{([^{}]*)\})?/g)) {
		const [, name, arg] = found;
		if (HEAVY.has(name)) full = 'heavy';
		else if (LIGHT.has(name)) {
			if (name === 'hline') hlines++;
			full = heavier(full, hlines > 1 ? 'double' : 'light');
		} else if (PARTIAL.has(name)) {
			const span = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(arg ?? '');
			if (!span) continue;
			for (let col = Number(span[1]) - 1; col < Math.min(columns, Number(span[2])); col++)
				if (col >= 0) across[col] = heavier(across[col], 'light');
		}
	}
	return full ? across.map((own) => heavier(own, full)) : across;
}

function groupEnd(spec: string, open: number): number {
	const close = spec[open] === '[' ? ']' : '}';
	let depth = 0;
	for (let i = open; i < spec.length; i++) {
		if (spec[i] === spec[open]) depth++;
		else if (spec[i] === close && --depth === 0) return i + 1;
	}
	return spec.length;
}

function expandRepeats(spec: string): string {
	let out = spec;
	for (let guard = 0; guard < 20; guard++) {
		const at = out.search(/\*\s*\{/);
		if (at < 0) return out;
		const countFrom = out.indexOf('{', at);
		const countTo = groupEnd(out, countFrom);
		const bodyFrom = out.indexOf('{', countTo);
		if (bodyFrom < 0) return out;
		const bodyTo = groupEnd(out, bodyFrom);
		const times = Math.min(200, Number.parseInt(out.slice(countFrom + 1, countTo - 1), 10) || 0);
		out = out.slice(0, at) + out.slice(bodyFrom + 1, bodyTo - 1).repeat(times) + out.slice(bodyTo);
	}
	return out;
}

/** the column letters, with a bar before each column and one after the last; null when the spec does not name `columns` columns */
export function columnsOf(colspec: string, columns: number): SpecColumns | null {
	const spec = expandRepeats(colspec);
	const bars: boolean[] = [];
	const letters: string[] = [];
	let bar = false;
	for (let i = 0; i < spec.length;) {
		const ch = spec[i];
		if (ch === '|') {
			bar = true;
			i++;
		} else if (ch === '@' || ch === '!' || ch === '>' || ch === '<') {
			const open = spec.indexOf('{', i);
			i = open < 0 ? spec.length : groupEnd(spec, open);
		} else if (/[A-Za-z]/.test(ch)) {
			bars.push(bar);
			letters.push(ch);
			bar = false;
			i++;
			while (spec[i] === '{' || spec[i] === '[') i = groupEnd(spec, i);
		} else i++;
	}
	bars.push(bar);
	return letters.length === columns ? { bars, letters } : null;
}

// l c r, the capitals tabulary and array users define for them, and the number columns of siunitx and dcolumn
function alignOf(letter: string | undefined): CellAlign {
	if (letter === 'c' || letter === 'C') return 'center';
	if (letter === 'r' || letter === 'R' || letter === 'S' || letter === 'D') return 'right';
	return 'left';
}

// the spec the editor saves for a table it made: every bar, centered, a header column to the left (tableSerializer)
function madeLetters(table: Node, columns: number): string[] {
	const headerColumn = table.childCount > 1 && table.child(1).firstChild?.type.name === 'table_header';
	return Array.from({ length: columns }, (_, col) => (headerColumn && col === 0 ? 'l' : 'c'));
}

function betweenRows(table: Node, row: number): string {
	const above = row > 0 ? String(table.child(row - 1).attrs.rowEnd ?? '') : '';
	const own = row < table.childCount ? String(table.child(row).attrs.topRules ?? '') : String(table.attrs.bottomRules ?? '');
	return `${above}\n${own}`;
}

function strongest(rules: (RuleWeight | null)[], from: number, to: number): RuleWeight | null {
	let found: RuleWeight | null = null;
	for (let col = from; col < to; col++) found = heavier(found, rules[col]);
	return found;
}

/** each cell's edges and alignment by the cell's offset inside the table */
export function cellEdgesOf(table: Node): Map<number, CellEdges> {
	const map = TableMap.get(table);
	const edges = new Map<number, CellEdges>();
	const made = !(table.attrs.env && table.attrs.colspec != null);
	const spec = made ? null : columnsOf(String(table.attrs.colspec), map.width);
	const letters = made ? madeLetters(table, map.width) : (spec?.letters ?? []);
	const lines = Array.from({ length: map.height + 1 }, (_, row) =>
		made ? Array.from({ length: map.width }, (): RuleWeight => 'light') : horizontalRule(betweenRows(table, row), map.width)
	);
	for (const at of new Set(map.map)) {
		const rect = map.findCell(at);
		const ownSpec = table.nodeAt(at)?.attrs.mcAlign;
		const own = typeof ownSpec === 'string' ? columnsOf(ownSpec, 1) : null;
		edges.set(at, {
			top: strongest(lines[rect.top], rect.left, rect.right),
			bottom: strongest(lines[rect.bottom], rect.left, rect.right),
			left: made || (own ? own.bars[0] : (spec?.bars[rect.left] ?? false)),
			right: made || (own ? own.bars[1] : (spec?.bars[rect.right] ?? false)),
			align: alignOf(own ? own.letters[0] : letters[rect.left])
		});
	}
	return edges;
}

// a table with a stated width fills it, any other is as wide as its cells
function fillsWidth(table: Node): boolean {
	return typeof table.attrs.tabularxWidth === 'string' && table.attrs.tabularxWidth.trim() !== '';
}

export const latexTableLook: TableLook = { edgesOf: cellEdgesOf, fillsWidth };
