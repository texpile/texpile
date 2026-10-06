// Typst tables against typst itself: for each table, the grid the visual editor shows, the grid typst lays out
// (its HTML export writes the resolved table: thead rows, spans, filler cells), and the same after every table
// edit the editor offers, saved and laid out again. Inert unless TINYMIST points at a tinymist binary.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import {
	CellSelection,
	TableMap,
	addColumnAfter,
	addColumnBefore,
	addRowAfter,
	addRowBefore,
	deleteColumn,
	deleteRow,
	mergeCells,
	splitCell,
	tableEditing
} from 'prosemirror-tables';
import { typstHeaderRows } from '$lib/languages/typst/visual/extensions/typstHeaderRows';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typSchema } from '$lib/languages/typst/visual/schema';

const TINYMIST = process.env.TINYMIST ?? '';

const CASES: Record<string, string> = {
	plain: '#table(columns: 2, [a], [b], [c], [d])',
	header: '#table(columns: 2, table.header([H1], [H2]), [a], [b], [c], [d])',
	'two header rows': '#table(columns: 2, table.header([H1], [H2], [I1], [I2]), [a], [b])',
	'header colspan': '#table(columns: 3, table.header(table.cell(colspan: 2)[H], [G]), [a], [b], [c])',
	'header rowspan into next row': '#table(columns: 3, table.header(table.cell(rowspan: 2)[H1], [H2], [H3]), [b], [c], [d], [e], [f])',
	'header rowspan 3 and 2':
		'#table(columns: 3, table.header(table.cell(rowspan: 3)[A], table.cell(rowspan: 2)[B], [C], [D], [E]), [x], [y], [z])',
	'header rowspan with second row given':
		'#table(columns: 3, table.header(table.cell(rowspan: 2)[H1], [H2], [H3], [I2], [I3]), [b], [c], [d])',
	louis:
		'#table(\n  columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr, 1fr, 1fr),\n  table.header(table.cell(rowspan: 2)[Column], table.cell(colspan: 3)[Elektrische Entladungen], table.cell(colspan: 3)[Lokale], table.cell(rowspan: 2)[Zersetzung]),\n  [Lichtbogen], [Funken], [TE], [], [], [],\n  [Wasser], [], [], [], [], [], [], [],\n  [], [], [], [], [], [], [], [],\n)',
	'body colspan': '#table(columns: 3, table.cell(colspan: 2)[ab], [c], [d], [e], [f])',
	'body rowspan': '#table(columns: 2, table.cell(rowspan: 2)[a], [b], [c], [d], [e])',
	'body 2x2 block': '#table(columns: 3, table.cell(colspan: 2, rowspan: 2)[A], [b], [c], [d], [e], [f])',
	'rowspan past the last row': '#table(columns: 2, table.cell(rowspan: 3)[a], [b], [c])',
	'short last row': '#table(columns: 3, [a], [b], [c], [d])',
	hlines: '#table(columns: 2, table.hline(), [a], [b], table.hline(stroke: 2pt), [c], [d], table.hline())',
	'hline in header': '#table(columns: 2, table.header([H1], [H2], table.hline(), [I1], [I2]), [a], [b])',
	'header after body rows': '#table(columns: 2, [a], [b], table.header([H1], [H2]), [c], [d])',
	'two headers': '#table(columns: 2, table.header([H1], [H2]), [a], [b], table.header([J1], [J2]), [c], [d])',
	'only a header': '#table(columns: 2, table.header([H1], [H2]))',
	'empty header call': '#table(columns: 2, table.header(), [a], [b])',
	'align and stroke': '#table(columns: (auto, 1fr), align: (left, right), stroke: none, [a], [b], [c], [d])',
	'markup in cells': '#table(columns: 2, [*bold* x], [_it_], [`code`], [a \\ b])',
	'full width colspan row': '#table(columns: 3, table.cell(colspan: 3)[all], [a], [b], [c])',
	'rowspan then partly covered': '#table(columns: 3, [a], table.cell(rowspan: 2)[b], [c], [d], [e], [f], [g], [h])',
	'colspan and rowspan in header and body':
		'#table(columns: 4, table.header(table.cell(colspan: 2)[H], table.cell(rowspan: 2)[R], [S], [T], [U], [V]), table.cell(rowspan: 2)[a], [b], [c], [d], [e], [f], [g])',
	'header with cells of a covered row given': '#table(columns: 2, table.header(table.cell(rowspan: 2)[H], [I], [J]), [a], [b])',
	'one column': '#table(columns: 1, table.header([H]), [a], [b])',
	'columns as count with header and short body': '#table(columns: 4, table.header([A], [B], [C], [D]), [a])'
};

type Cell = string;
type Grid = Cell[][];

function cellKey(th: boolean, text: string, rs: number, cs: number): Cell {
	return `${th ? 'th' : 'td'}:${text.replace(/\s+/g, ' ').trim()}${rs > 1 ? ` r${rs}` : ''}${cs > 1 ? ` c${cs}` : ''}`;
}

/** every table in typst's HTML of `src`, as grids; a compile error comes back as a string */
function typstGrids(src: string): Grid[] | string {
	const dir = mkdtempSync(join(tmpdir(), 'typtab-'));
	try {
		writeFileSync(join(dir, 'm.typ'), src, 'utf8');
		try {
			execFileSync(TINYMIST, ['compile', '--root', dir, join(dir, 'm.typ'), join(dir, 'm.html')], { stdio: 'pipe' });
		} catch (e) {
			const p = e as { stderr?: Buffer; stdout?: Buffer };
			const msg = (p.stderr?.toString() || '') + (p.stdout?.toString() || '');
			if (!existsSync(join(dir, 'm.html')) || /error:/.test(msg))
				return (
					msg
						.split('\n')
						.filter((l) => /error/.test(l))
						.join(' | ') || 'compile failed'
				);
		}
		const html = readFileSync(join(dir, 'm.html'), 'utf8');
		return [...html.matchAll(/<table>([\s\S]*?)<\/table>/g)].map((t) =>
			[...t[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((tr) =>
				[...tr[1].matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/\1>/g)].map((c) => {
					const rs = Number(/rowspan="(\d+)"/.exec(c[2])?.[1] ?? 1);
					const cs = Number(/colspan="(\d+)"/.exec(c[2])?.[1] ?? 1);
					return cellKey(
						c[1] === 'th',
						c[3]
							.replace(/<br\s*\/?>/g, ' ')
							.replace(/<[^>]+>/g, '')
							.replace(/&amp;/g, '&'),
						rs,
						cs
					);
				})
			)
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function firstTable(doc: Node): Node | null {
	let t: Node | null = null;
	doc.descendants((n) => {
		if (t) return false;
		if (n.type.name === 'table') {
			t = n;
			return false;
		}
		return true;
	});
	return t;
}

function modelGrid(table: Node): Grid {
	const rows: Grid = [];
	table.forEach((row) => {
		const cells: Cell[] = [];
		row.forEach((c) =>
			cells.push(cellKey(c.type.name === 'table_header', c.textContent, Number(c.attrs.rowspan ?? 1), Number(c.attrs.colspan ?? 1)))
		);
		rows.push(cells);
	});
	return rows;
}

const show = (g: Grid | string | null) => (typeof g === 'string' || !g ? String(g) : g.map((r) => r.join(' | ')).join('\n'));

type Edit = { name: string; run: (state: EditorState) => EditorState | null };

function tablePos(doc: Node): number {
	let pos = -1;
	doc.descendants((n, p) => {
		if (pos >= 0) return false;
		if (n.type.name === 'table') pos = p;
		return pos < 0;
	});
	return pos;
}

/** the edits the editor offers, at a few cells: row and column ops in the cell, merges of the cell with a neighbour */
function editsFor(doc: Node): Edit[] {
	const table = firstTable(doc)!;
	const tStart = tablePos(doc) + 1;
	const map = TableMap.get(table);
	const cellAt = (r: number, c: number) => tStart + map.map[r * map.width + c];
	const anchors: [number, number][] = [
		[0, 0],
		[Math.min(1, map.height - 1), Math.min(1, map.width - 1)],
		[map.height - 1, map.width - 1]
	];
	const out: Edit[] = [];
	// applied as the editor applies it, with tableEditing's and typstHeaderRows' own fixes appended
	const cmd = (f: (s: EditorState, d: (tr: Transaction) => void) => boolean) => (state: EditorState) => {
		let next: EditorState | null = null;
		return f(state, (t) => (next = state.apply(t))) ? next : null;
	};
	const inCell = (r: number, c: number) => (state: EditorState) =>
		state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(cellAt(r, c) + 1))));
	for (const [r, c] of anchors) {
		// the table menu's commands (contextMenuItems.ts); it offers no header toggles
		const ops = { addRowAfter, addRowBefore, addColumnAfter, addColumnBefore, deleteRow, deleteColumn, splitCell };
		for (const [name, op] of Object.entries(ops)) out.push({ name: `${name} at ${r},${c}`, run: (s) => cmd(op)(inCell(r, c)(s)) });
		const merges: [number, number, string][] = [
			[r, c + 1, 'right'],
			[r + 1, c, 'down'],
			[r + 1, c + 1, 'diagonal']
		];
		for (const [r2, c2, dir] of merges) {
			if (r2 >= map.height || c2 >= map.width) continue;
			out.push({
				name: `merge ${dir} from ${r},${c}`,
				run: (s) => cmd(mergeCells)(s.apply(s.tr.setSelection(CellSelection.create(s.doc, cellAt(r, c), cellAt(r2, c2)))))
			});
		}
	}
	return out;
}

const findings: string[] = [];

describe.skipIf(!TINYMIST)('typst tables against typst', () => {
	for (const [name, src] of Object.entries(CASES)) {
		it(name, () => {
			const doc = typstToProseMirror(src + '\n').doc;
			const table = firstTable(doc);
			const truth = typstGrids(src + '\n');
			if (typeof truth === 'string') {
				findings.push(`[${name}] typst rejects the source itself: ${truth}`);
				return;
			}
			if (!table) {
				findings.push(`[${name}] stays raw`);
				return;
			}
			const shown = modelGrid(table);
			if (show(shown) !== show(truth[0])) findings.push(`[${name}] PARSE differs\n  editor:\n${show(shown)}\n  typst:\n${show(truth[0])}`);
			const saved = serializeToTypst(doc);
			const savedTruth = typstGrids(saved);
			if (typeof savedTruth === 'string') findings.push(`[${name}] SAVE untouched does not compile: ${savedTruth}\n${saved}`);
			else if (show(savedTruth[0]) !== show(truth[0]))
				findings.push(`[${name}] SAVE untouched lays out differently\n${saved}\n  typst now:\n${show(savedTruth[0])}`);

			const state = EditorState.create({ schema: typSchema, doc, plugins: [tableEditing(), typstHeaderRows] });
			for (const edit of editsFor(doc)) {
				let tr: EditorState | null;
				try {
					tr = edit.run(state);
				} catch (e) {
					findings.push(`[${name}] ${edit.name}: threw ${(e as Error).message}`);
					continue;
				}
				if (!tr) continue;
				const after = firstTable(tr.doc);
				if (!after) continue;
				const out = serializeToTypst(tr.doc);
				const want = modelGrid(after);
				const got = typstGrids(out);
				if (typeof got === 'string') {
					findings.push(`[${name}] ${edit.name}: saved source does not compile: ${got}\n${out}`);
					continue;
				}
				if (show(got[0]) !== show(want))
					findings.push(
						`[${name}] ${edit.name}: EDIT saved lays out differently\n  editor:\n${show(want)}\n  typst:\n${show(got[0])}\n  source:\n${out}`
					);
				const again = firstTable(typstToProseMirror(out).doc);
				if (!again) findings.push(`[${name}] ${edit.name}: saved table reopens raw\n${out}`);
				else if (show(modelGrid(again)) !== show(want))
					findings.push(`[${name}] ${edit.name}: REOPEN differs\n  before:\n${show(want)}\n  after:\n${show(modelGrid(again))}`);
			}
		});
	}
	it('agrees with typst everywhere', () => {
		// a table typst has no row model for (an hline inside a header) stays raw, which is safe
		const real = findings.filter((f) => !f.endsWith('stays raw'));
		writeFileSync(join(tmpdir(), 'typst-table-oracle.txt'), real.join('\n\n'), 'utf8');
		expect(real, real.join('\n\n')).toEqual([]);
	});
});
