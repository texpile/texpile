// a display that sat inside a paragraph came back with a \par before it and a blank line after,
// so the continuation became a new, indented paragraph with extra space above the equation
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('display math inside a paragraph', () => {
	it('keeps one paragraph around \\[ \\]', () => {
		const out = rt('We have\n\\[\nx = 1\n\\]\nwhere $x$ is.');
		expect(out).not.toMatch(/We have\s*\\par/);
		expect(out).not.toMatch(/\\\]\s*\n\s*\n/);
		expect(out).toMatch(/where \$x\$ is\. \\par/);
	});

	it('keeps one paragraph around an align', () => {
		const out = rt('We have\n\\begin{align}\nx &= 1\n\\end{align}\nwhere $x$ is.');
		expect(out).not.toMatch(/We have\s*\\par/);
		expect(out).not.toMatch(/\\end\{align\}\s*\n\s*\n/);
	});

	it('a display between two paragraphs stays between them', () => {
		const out = rt('First.\n\n\\[\nx = 1\n\\]\n\nSecond.');
		expect(out).toMatch(/First\.\n\s*\n\\\[/);
		expect(out).toMatch(/\\\]\n\s*\nSecond/);
	});

	it('a display ending a paragraph does not glue the next one on', () => {
		const out = rt('We have\n\\[\nx = 1\n\\]\n\nNext paragraph.');
		expect(out).not.toMatch(/We have\s*\\par/);
		expect(out).toMatch(/\\\]\n\s*\nNext paragraph/);
	});

	it('a math environment kept as a chip continues the paragraph', () => {
		expect(rt('We have\n\\begin{cases} a & b \\end{cases}\nmore.')).not.toMatch(/We have\s*\\par/);
	});
});
