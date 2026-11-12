// the Lines choice written into a LaTeX table: its column spec's bars and the rules between its rows
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { TableMap } from 'prosemirror-tables';
import { editPreambleHere, withPackageNeeded, type TableLines } from '$lib/languages/latex/visual/core';
import { expandRepeats, groupEnd, madeLetters, RULE_COMMANDS } from './tableRuleEdges';

const WITH_GROUPS = new Set(['Xhline', 'specialrule', 'hhline', 'cline', 'cmidrule', 'cdashline', 'tabucline']);
const TRIMS = '(?:\\s*\\([^)]*\\))?(?:\\s*\\[[^\\]]*\\])?';

function named(names: string[]): string {
	return `(?:${names.join('|')})(?![A-Za-z@])${TRIMS}`;
}

const RULE = new RegExp(
	`\\\\(?:${named(RULE_COMMANDS.filter((name) => !WITH_GROUPS.has(name)))}|${named(RULE_COMMANDS.filter((name) => WITH_GROUPS.has(name)))}(?:\\s*\\{[^{}]*\\})*(?:\\s*\\[[^\\]]*\\])?)`,
	'g'
);

/** what stands between two rows with its rules taken out: a \rowcolor, a strut or a longtable marker stays */
export function withoutRules(between: string): string {
	return between
		.replace(RULE, '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join('\n');
}

function ruledBy(rule: string, between: string): string {
	return [rule, withoutRules(between)].filter(Boolean).join('\n');
}

/** the spec with a bar after every column and, with `leading`, one before the first, or with none; what stands between the columns stays */
export function withBars(colspec: string, bars: boolean, leading = bars): string {
	const spec = expandRepeats(colspec);
	let out = '';
	let prefix = '';
	let first = true;
	for (let i = 0; i < spec.length;) {
		const ch = spec[i];
		if (ch === '|') i++;
		else if (ch === '>') {
			const open = spec.indexOf('{', i);
			const end = open < 0 ? spec.length : groupEnd(spec, open);
			prefix += spec.slice(i, end);
			i = end;
		} else if (/[A-Za-z]/.test(ch)) {
			let end = i + 1;
			while (spec[end] === '{' || spec[end] === '[') end = groupEnd(spec, end);
			out += ((first ? leading : bars) ? '|' : '') + prefix + spec.slice(i, end);
			prefix = '';
			first = false;
			i = end;
		} else if (ch === '@' || ch === '!' || ch === '<') {
			const open = spec.indexOf('{', i);
			const end = open < 0 ? spec.length : groupEnd(spec, open);
			out += spec.slice(i, end);
			i = end;
		} else {
			out += ch;
			i++;
		}
	}
	return bars ? `${out}|` : out;
}

type RowRules = { first: string; second: string; inner: string; bottom: string };

const RULES: Record<TableLines, RowRules> = {
	all: { first: '\\hline', second: '\\hline', inner: '\\hline', bottom: '\\hline' },
	formal: { first: '\\toprule', second: '\\midrule', inner: '', bottom: '\\bottomrule' },
	none: { first: '', second: '', inner: '', bottom: '' }
};

function ruleOver(rules: RowRules, row: number, rows: number): string {
	if (row >= rows) return rules.bottom;
	return row === 0 ? rules.first : row === 1 ? rules.second : rules.inner;
}

/** `tr` with the table at `pos` given every line, the three of booktabs, or none */
export function withLatexLines(tr: Transaction, pos: number, lines: TableLines): Transaction {
	const table = tr.doc.nodeAt(pos);
	if (table?.type.name !== 'table') return tr;
	const map = TableMap.get(table);
	const rules = RULES[lines];
	const all = lines === 'all';
	// a table the editor made has no spec yet: it gets the one it would be saved with
	const made = !(table.attrs.env && table.attrs.colspec != null);
	const spec = made ? madeLetters(table, map.width).join('') : String(table.attrs.colspec);
	// the row above ends a section of a longtable, and the rule under it stands above the section's marker
	let ruledAbove = false;
	table.forEach((row, offset, index) => {
		const end = withoutRules(String(row.attrs.rowEnd ?? ''));
		tr.setNodeMarkup(pos + 1 + offset, undefined, {
			...row.attrs,
			topRules: ruledBy(ruledAbove ? '' : ruleOver(rules, index, table.childCount), String(row.attrs.topRules ?? '')),
			rowEnd: end && ruledBy(ruleOver(rules, index + 1, table.childCount), end)
		});
		ruledAbove = !!end;
		row.forEach((cell, within) => {
			const own = typeof cell.attrs.mcAlign === 'string' && cell.attrs.mcAlign ? cell.attrs.mcAlign : null;
			// a span made in the editor has no spec either and is saved with its bars
			if (!own && (all || Number(cell.attrs.colspan ?? 1) < 2)) return;
			const at = offset + 1 + within;
			tr.setNodeMarkup(pos + 1 + at, undefined, { ...cell.attrs, mcAlign: withBars(own ?? 'c', all, all && map.findCell(at).left === 0) });
		});
	});
	return tr.setNodeMarkup(pos, undefined, {
		...table.attrs,
		env: table.attrs.env ?? 'tabular',
		colspec: withBars(spec, all),
		bottomRules: ruledBy(ruledAbove ? '' : rules.bottom, String(table.attrs.bottomRules ?? ''))
	});
}

export function setLatexLines(view: EditorView, pos: number, lines: TableLines): void {
	if (lines === 'formal') editPreambleHere.current?.((preamble) => withPackageNeeded(preamble, { name: 'booktabs', command: 'toprule' }));
	view.dispatch(withLatexLines(view.state.tr, pos, lines));
}
