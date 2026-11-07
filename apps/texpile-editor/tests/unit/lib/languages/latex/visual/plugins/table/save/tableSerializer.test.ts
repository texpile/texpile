// text in a table's notes slot is written even where the notes switch is off or the table is a longtable
import { describe, it, expect } from 'vitest';
import { Fragment, Slice, type Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const file = (body: string) => `\\documentclass{article}\n\\usepackage{longtable}\n\\begin{document}\n${body}\n\\end{document}\n`;

function withNotes(doc: Node, text: string): Node {
	const wrapper = doc.child(0);
	const { schema } = doc.type;
	const notes = schema.nodes.table_notes.create(null, schema.text(text));
	const next = wrapper.type.create(wrapper.attrs, wrapper.content.append(Fragment.from(notes)));
	return doc.replace(0, wrapper.nodeSize, new Slice(Fragment.from(next), 0, 0));
}

describe('table notes save', () => {
	it('writes notes typed into a captioned longtable', () => {
		const parsed = parseLatexFile(file('\\begin{longtable}{ll}\n\\caption{LC}\\\\\nH1 & H2 \\\\\n\\end{longtable}'));
		expect(parsed.doc.child(0).type.name).toBe('table_wrapper');
		const out = serializeLatexFile(parsed, withNotes(parsed.doc, 'Qnote'));
		expect(out).toContain('\\end{longtable}\n\\par\\smallskip\n{\\small Qnote}');
	});

	it('writes notes typed into a float whose notes switch is off', () => {
		const parsed = parseLatexFile(
			file('\\begin{table}[h]\n\\caption{Cap}\n\\begin{tabular}{lr}\nA & B \\\\\n\\end{tabular}\n\\end{table}')
		);
		const out = serializeLatexFile(parsed, withNotes(parsed.doc, 'Qnote'));
		expect(out).toContain('Qnote');
	});
});
