import { describe, it, expect } from 'vitest';
import { EditorState, type Command } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { CellSelection, addColumnAfter, addRowAfter, deleteRow, mergeCells } from 'prosemirror-tables';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

const TABLE = 'Intro.\n\n#table(\n  columns: 2,\n  table.header([K], [V]),\n  [a b], [1 2],\n  [c d], [3 4],\n)\n';

function tableOf(doc: Node): Node | null {
	let found: Node | null = null;
	doc.descendants((n) => {
		if (!found && n.type.name === 'table') found = n;
		return !found;
	});
	return found;
}

/** the table as rows of cell texts, a header cell starred, a merged one with its span */
function grid(doc: Node): string[][] | null {
	const table = tableOf(doc);
	if (!table) return null;
	const rows: string[][] = [];
	table.forEach((row) => {
		const cells: string[] = [];
		row.forEach((c) => cells.push(`${c.type.name === 'table_header' ? '*' : ''}${c.textContent} ${c.attrs.colspan}x${c.attrs.rowspan}`));
		rows.push(cells);
	});
	return rows;
}

function cellPos(doc: Node, row: number, col: number): number {
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.type.name === 'table') at = pos;
		return at < 0;
	});
	const table = doc.nodeAt(at)!;
	let pos = at + 1;
	for (let r = 0; r < row; r++) pos += table.child(r).nodeSize;
	pos += 1;
	for (let c = 0; c < col; c++) pos += table.child(row).child(c).nodeSize;
	return pos;
}

/** `cmd` run over the cells from `from` to `to` of the file's table, the way the table menu runs it */
function fromMenu(src: string, from: [number, number], to: [number, number], cmd: Command): { edited: Node; out: string } {
	const parsed = parseTypstFile(src);
	let state = EditorState.create({ doc: parsed.doc });
	state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, cellPos(state.doc, ...from), cellPos(state.doc, ...to))));
	let edited: Node | null = null;
	expect(cmd(state, (tr) => (edited = tr.doc))).toBe(true);
	return { edited: edited!, out: serializeTypstFile(parsed, edited!) };
}

/** the file's table with every column given a measured width, as a drag or the open-time sync leaves it */
function withWidths(src: string, widths: number[]): { parsed: ReturnType<typeof parseTypstFile>; doc: Node } {
	const parsed = parseTypstFile(src);
	const blocks: Node[] = [];
	parsed.doc.forEach((block) => {
		if (block.type.name !== 'table') return void blocks.push(block);
		const rows: Node[] = [];
		block.forEach((row) => {
			const cells: Node[] = [];
			row.forEach((cell, _o, i) => cells.push(cell.type.create({ ...cell.attrs, colwidth: [widths[i]] }, cell.content, cell.marks)));
			rows.push(row.type.create(row.attrs, cells, row.marks));
		});
		blocks.push(block.type.create(block.attrs, rows, block.marks));
	});
	return { parsed, doc: parsed.doc.type.create(parsed.doc.attrs, blocks, parsed.doc.marks) };
}

describe('a table changed from the table menu reads back as the table the editor shows', () => {
	it('rows and columns taken out, added or merged', () => {
		const cases: [string, [number, number], [number, number], Command][] = [
			['delete the header row', [0, 0], [0, 1], deleteRow],
			['add a row below the header', [0, 0], [0, 0], addRowAfter],
			['add a column', [1, 1], [1, 1], addColumnAfter]
		];
		for (const [name, from, to, cmd] of cases) {
			const { edited, out } = fromMenu(TABLE, from, to, cmd);
			expect(grid(parseTypstFile(out).doc), `${name}:\n${out}`).toEqual(grid(edited));
		}
		// a row left with no cells of its own wrote a lone comma, which typst refuses
		const merged = fromMenu(TABLE, [1, 0], [2, 1], mergeCells).out;
		expect(merged).not.toMatch(/,\s*,/);
		expect(tableOf(parseTypstFile(merged).doc), merged).not.toBeNull();
	});

	it('a column dragged wider reaches columns:, and widths the file already says leave it as written', () => {
		const dragged = withWidths('Before.\n\n#table(\n  columns: 3,\n  [a], [b], [c],\n)\n', [240, 120, 120]);
		expect(serializeTypstFile(dragged.parsed, dragged.doc)).toContain('columns: (1.5fr, 0.75fr, 0.75fr)');
		const src = 'Before.\n\n#table(columns: (2fr, 1fr), [a],[b])\n';
		const synced = withWidths(src, [200, 100]);
		expect(serializeTypstFile(synced.parsed, synced.doc)).toBe(src);
	});
});
