// What can actually be merged in a Typst table, and does the merge survive a source round trip.
//
// Every case here was broken at some point, and two of them were worse than a lost merge: a 2x2
// merge left a row with no cells and serialized it as a lone `,`, which typst rejects outright
// ("unexpected comma"), and a merged HEADER cell was written as a plain [..] so the span was
// silently dropped on the next parse. Both only showed up by driving prosemirror-tables' real
// mergeCells and reading the source back, which is what this does.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EditorState } from 'prosemirror-state';
import { CellSelection, mergeCells } from 'prosemirror-tables';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typSchema } from '$lib/languages/typst/visual/schema';

const WITH_HEADER = '#table(\n  columns: 2,\n  table.header([H1], [H2]),\n  [a], [b],\n  [c], [d],\n)\n';
const PLAIN = '#table(\n  columns: 2,\n  [a], [b],\n  [c], [d],\n)\n';

type Kind = 'table_cell' | 'table_header' | 'any';

/** merges the i-th and j-th cell of `kind` and returns the source that comes out. */
function merge(src: string, kind: Kind, i: number, j: number): string {
	const doc = typstToProseMirror(src).doc;
	const state = EditorState.create({ schema: typSchema, doc });
	const pos: number[] = [];
	doc.descendants((n, p) => {
		const name = n.type.name;
		if (kind === 'any' ? name === 'table_cell' || name === 'table_header' : name === kind) pos.push(p);
	});
	let out = '';
	const applied = mergeCells(state.apply(state.tr.setSelection(CellSelection.create(doc, pos[i], pos[j]))), (tr) => {
		out = serializeToTypst(tr.doc);
	});
	expect(applied, 'prosemirror-tables refused the merge').toBe(true);
	return out;
}

/** the largest area any single cell covers after re-parsing; 1 means the merge was lost. */
function maxSpanAfterReparse(src: string): number {
	let area = 0;
	typstToProseMirror(src).doc.descendants((n) => {
		if (n.attrs?.colspan) area = Math.max(area, Number(n.attrs.colspan) * Number(n.attrs.rowspan ?? 1));
	});
	return area;
}

const CASES: Record<string, { src: string; kind: Kind; i: number; j: number }> = {
	'two body cells across a row': { src: PLAIN, kind: 'table_cell', i: 0, j: 1 },
	'two body cells down a column': { src: PLAIN, kind: 'table_cell', i: 0, j: 2 },
	'a 2x2 block of body cells': { src: PLAIN, kind: 'table_cell', i: 0, j: 3 },
	'two header cells': { src: WITH_HEADER, kind: 'table_header', i: 0, j: 1 },
	'a header cell into the body below it': { src: WITH_HEADER, kind: 'any', i: 0, j: 2 },
	'body cells in a table that has a header': { src: WITH_HEADER, kind: 'table_cell', i: 0, j: 1 }
};

describe('merged cells survive a source round trip', () => {
	for (const [name, c] of Object.entries(CASES)) {
		it(name, () => {
			const out = merge(c.src, c.kind, c.i, c.j);
			expect(out).toContain('table.cell(');
			expect(maxSpanAfterReparse(out), `the span was lost re-parsing:\n${out}`).toBeGreaterThan(1);
			// and the next save must not drift, or the merge decays over successive edits
			expect(serializeToTypst(typstToProseMirror(out).doc)).toBe(out);
		});
	}
});

/** each row's cell texts, header cells marked with a leading `#` */
function grid(src: string): string[][] {
	const rows: string[][] = [];
	typstToProseMirror(src).doc.descendants((n) => {
		if (n.type.name === 'table_row') rows.push([]);
		if (n.type.name === 'table_cell' || n.type.name === 'table_header')
			rows[rows.length - 1].push((n.type.name === 'table_header' ? '#' : '') + n.textContent);
	});
	return rows;
}

describe('a header cell merged down', () => {
	// typst grows the header to the rows a merged header cell reaches; the cells after table.header go below it
	it('parses the cells after the header below it, as typst lays them out', () => {
		const src = '#table(\n  columns: 3,\n  table.header(table.cell(rowspan: 2)[H1], [H2], [H3]),\n  [b], [c],\n  [d], [e], [f],\n)\n';
		expect(grid(src)).toEqual([
			['#H1', '#H2', '#H3'],
			['#', '#'],
			['b', 'c', 'd'],
			['e', 'f', '']
		]);
	});
	it('writes the rows it reaches inside table.header', () => {
		const out = merge(WITH_HEADER, 'any', 0, 2);
		expect(out).toContain('  table.header(\n    table.cell(rowspan: 2)[');
		expect(out).toContain('    [b],\n  ),\n  [c], [d],');
		expect(grid(out)[1]).toEqual(['#b']);
	});
});

function hasTinymist(): boolean {
	try {
		execFileSync('tinymist', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

describe.skipIf(!hasTinymist())('a merged table is still code typst accepts', () => {
	for (const [name, c] of Object.entries(CASES)) {
		it(name, () => {
			const dir = mkdtempSync(join(tmpdir(), 'typmerge-'));
			try {
				const file = join(dir, 'm.typ');
				writeFileSync(file, merge(c.src, c.kind, c.i, c.j), 'utf8');
				try {
					execFileSync('tinymist', ['compile', '--root', dir, file, join(dir, 'm.pdf')], { stdio: 'pipe' });
				} catch (e) {
					const proc = e as { stderr?: Buffer; stdout?: Buffer };
					expect((proc.stderr?.toString() || proc.stdout?.toString() || String(e)).trim()).toBe('');
				}
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});
	}
});
