import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

const parse = (s: string): Node => treeToProseMirror(s, {}).doc;
const rt = (s: string) => serializeToLatex(parse(s));

function cells(doc: Node): { text: string; colspan: number; rowspan: number }[] {
	const out: { text: string; colspan: number; rowspan: number }[] = [];
	doc.descendants((n) => {
		if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
			out.push({ text: n.textContent, colspan: Number(n.attrs.colspan ?? 1), rowspan: Number(n.attrs.rowspan ?? 1) });
		}
		return true;
	});
	return out;
}

describe('merged table cells round-trip (\\multicolumn / \\multirow)', () => {
	it('parses \\multicolumn into a colspan cell (not raw content)', () => {
		const doc = parse('\\begin{tabular}{ccc}\n\\multicolumn{2}{c}{Wide} & B \\\\\n\\end{tabular}');
		expect(cells(doc).map((c) => [c.text, c.colspan])).toEqual([
			['Wide', 2],
			['B', 1]
		]);
	});

	it('parses \\multirow into a rowspan cell and drops the covered placeholder below it', () => {
		const doc = parse('\\begin{tabular}{cc}\n\\multirow{2}{*}{Tall} & A \\\\\n & B \\\\\n\\end{tabular}');
		expect(cells(doc).map((c) => [c.text, c.rowspan])).toEqual([
			['Tall', 2],
			['A', 1],
			['B', 1]
		]);
	});

	it('parses a \\multicolumn wrapping \\multirow (spans both ways)', () => {
		const doc = parse(
			'\\begin{tabular}{ccc}\n\\multicolumn{2}{c}{\\multirow{2}{*}{Big}} & A \\\\\n\\multicolumn{2}{c}{} & B \\\\\n\\end{tabular}'
		);
		const c = cells(doc);
		expect(c[0]).toEqual({ text: 'Big', colspan: 2, rowspan: 2 });
		expect(c.map((x) => x.text)).toEqual(['Big', 'A', 'B']); // the empty placeholder row is dropped
	});

	it('\\multicolumn survives serialize→parse at a fixed point', () => {
		const once = rt('\\begin{tabular}{ccc}\n\\multicolumn{2}{c}{Wide} & B \\\\\n\\end{tabular}');
		expect(once).toContain('\\multicolumn{2}');
		expect(rt(once)).toBe(once); // converged, no compounding
	});

	it('\\multirow survives serialize→parse at a fixed point', () => {
		const once = rt('\\begin{tabular}{cc}\n\\multirow{2}{*}{Tall} & A \\\\\n & B \\\\\n\\end{tabular}');
		expect(once).toContain('\\multirow{2}');
		expect(rt(once)).toBe(once); // converged
	});

	it('handles a rowspan in a MIDDLE column (placeholder lands between cells)', () => {
		const src = '\\begin{tabular}{ccc}\nA & \\multirow{2}{*}{Mid} & C \\\\\nD & & F \\\\\n\\end{tabular}';
		const doc = parse(src);
		expect(cells(doc).map((c) => c.text)).toEqual(['A', 'Mid', 'C', 'D', 'F']); // covered cell under Mid dropped
		expect(cells(doc).find((c) => c.text === 'Mid')?.rowspan).toBe(2);
		const once = rt(src);
		expect(rt(once)).toBe(once); // converges
	});

	it('handles a rowspan across 3 rows (drops both placeholders)', () => {
		const src = '\\begin{tabular}{cc}\n\\multirow{3}{*}{X} & a \\\\\n & b \\\\\n & c \\\\\n\\end{tabular}';
		const doc = parse(src);
		expect(cells(doc).find((c) => c.text === 'X')?.rowspan).toBe(3);
		expect(cells(doc).map((c) => c.text)).toEqual(['X', 'a', 'b', 'c']);
		const once = rt(src);
		expect(rt(once)).toBe(once); // converges
	});

	it('leaves a plain (no-merge) table unchanged structurally', () => {
		const doc = parse('\\begin{tabular}{cc}\na & b \\\\\nc & d \\\\\n\\end{tabular}');
		expect(cells(doc).map((c) => c.text)).toEqual(['a', 'b', 'c', 'd']);
		expect(cells(doc).every((c) => c.colspan === 1 && c.rowspan === 1)).toBe(true);
	});
});
