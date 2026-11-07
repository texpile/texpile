// a longtable with \endfirsthead, \endhead, \endfoot and a caption row was a raw chip; it is a captioned table whose rows keep their markers
import { describe, it, expect } from 'vitest';
import { Fragment, Slice, type Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { markerLinesOf, sectionOfRow } from '$lib/languages/latex/visual/plugins/table/longtable/longtableSections';

const LONG = `\\begin{longtable}{lll}
\\caption{A long table.}\\label{tab:long}\\\\
\\toprule
Name & Value & Unit \\\\
\\midrule
\\endfirsthead
\\toprule
Name & Value & Unit \\\\
\\midrule
\\endhead
\\bottomrule
\\endfoot
Alpha & 1 & m \\\\
Beta & 2 & s \\\\
\\end{longtable}`;

const file = (body: string) => `\\documentclass{article}\n\\usepackage{longtable,booktabs}\n\\begin{document}\n${body}\n\\end{document}\n`;

function editedCell(doc: Node, from: string, to: string): Node {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text === from) at = pos;
	});
	return doc.replace(at, at + from.length, new Slice(Fragment.from(doc.type.schema.text(to)), 0, 0));
}

describe('longtable markers', () => {
	it('opens as a numbered table with its caption, saves untouched byte for byte and writes an edited one back in place', () => {
		const text = file(LONG);
		const parsed = parseLatexFile(text);
		const wrapper = parsed.doc.child(0);
		expect(wrapper.type.name).toBe('table_wrapper');
		expect(wrapper.attrs.label).toBe('tab:long');
		expect(wrapper.child(0).textContent).toBe('A long table.');
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(text);
		const out = serializeLatexFile(parsed, editedCell(parsed.doc, 'Alpha', 'Alef'));
		expect(out).toContain(
			'\\begin{longtable}{lll}\n\\caption{A long table.}\\label{tab:long}\\\\\n\\toprule\nName & Value & Unit \\\\\n\\midrule\n\\endfirsthead\n'
		);
		expect(out).toContain('\\midrule\n\\endhead\n\\bottomrule\n\\endfoot\nAlef & 1 & m \\\\');
		expect(out.endsWith('\\end{longtable}\n\\end{document}\n')).toBe(true);
	});

	it('tells the head, foot and body rows apart', () => {
		const wrapper = parseLatexFile(file(LONG)).doc.child(0);
		const lines = markerLinesOf(wrapper.child(1), wrapper.child(0));
		expect(lines.map((l) => `${l.marker}@${l.before}`)).toEqual(['endfirsthead@1', 'endhead@2', 'endfoot@2']);
		expect([0, 1, 2, 3].map((row) => sectionOfRow(lines, row))).toEqual(['head', 'head', 'body', 'body']);
	});

	it('keeps a caption row that only a marker follows and a foot row with no row break', () => {
		const text = file(
			'\\begin{longtable}{ll}\n\\caption{Cap}\\\\\n\\endfirsthead\n\\hline\na & b \\\\\n\\hline\n\\multicolumn{2}{l}{Continued}\n\\endlastfoot\nc & d \\\\\n\\end{longtable}'
		);
		const parsed = parseLatexFile(text);
		expect(parsed.doc.child(0).type.name).toBe('table_wrapper');
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(text);
		const out = serializeLatexFile(parsed, editedCell(parsed.doc, 'c', 'e'));
		expect(out).toContain(
			'\\caption{Cap}\\\\\n\\endfirsthead\n\\hline\na & b \\\\\n\\hline\n\\multicolumn{2}{l}{Continued}\n\\endlastfoot\ne & d \\\\'
		);
	});
});
