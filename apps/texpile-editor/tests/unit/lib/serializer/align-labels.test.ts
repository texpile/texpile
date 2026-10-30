// labels in an align block were collected in order and put back by row index, so a label on the
// second row slid up to the first when the first had none, and \ref pointed at the wrong number
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(treeToProseMirror(s).doc);

describe('align labels stay on their row', () => {
	it('a label on the second row only', () => {
		const out = rt('\\begin{align}\na &= b \\\\\nc &= d \\label{eq:c}\n\\end{align}');
		const rows = out.split('\\\\');
		expect(rows[0]).not.toContain('\\label');
		expect(rows[1]).toContain('\\label{eq:c}');
	});

	it('labels around an unnumbered row', () => {
		const out = rt('\\begin{align}\na &= b \\\\\nc &= d \\label{eq:c} \\\\\ne &= f \\nonumber \\\\\ng &= h \\label{eq:g}\n\\end{align}');
		const rows = out.split('\\\\');
		expect(rows[0]).not.toContain('\\label');
		expect(rows[1]).toContain('\\label{eq:c}');
		expect(rows[2]).toContain('\\nonumber');
		expect(rows[2]).not.toContain('\\label');
		expect(rows[3]).toContain('\\label{eq:g}');
	});

	it('every row labelled is unchanged', () => {
		const out = rt('\\begin{align}\na &= b \\label{eq:a} \\\\\nc &= d \\label{eq:c}\n\\end{align}');
		const rows = out.split('\\\\');
		expect(rows[0]).toContain('\\label{eq:a}');
		expect(rows[1]).toContain('\\label{eq:c}');
	});
});
