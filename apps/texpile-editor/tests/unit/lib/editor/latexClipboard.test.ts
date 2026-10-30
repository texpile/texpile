import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { sliceToLatex, looksLikeLatex, parseLatexFragment } from '$lib/editor/visual/extensions/latexClipboard';
import { regenerateCopiedLabels } from '$lib/editor/visual/extensions/paste-uuid-fix';
import { Slice } from 'prosemirror-model';

describe('latex clipboard bridge', () => {
	it('copy: a block slice serializes to working LaTeX, an inline slice to its markup', () => {
		const { doc } = treeToProseMirror('\\section{Methods}\n\nBold \\textbf{claim} with $x^2$ inline.\n');
		const all = sliceToLatex(doc.slice(0, doc.content.size));
		expect(all).toContain('\\section{Methods}');
		expect(all).toContain('\\textbf{claim}');
		expect(all).toContain('$x^2$');

		// inline selection: just the bold word inside the paragraph
		const para = doc.child(1);
		const paraPos = doc.child(0).nodeSize;
		const from = paraPos + 1 + para.textContent.indexOf('claim');
		const inline = sliceToLatex(doc.slice(from, from + 'claim'.length));
		expect(inline.trim()).toBe('\\textbf{claim}');
	});

	it('copy: a mid-paragraph to mid-paragraph selection across blocks still yields all the markup', () => {
		const { doc } = treeToProseMirror('First words of one paragraph.\n\n\\section{Middle}\n\nSecond paragraph tail words.\n');
		// from inside the first paragraph to inside the last: openStart/openEnd both nonzero
		const from = 1 + 'First '.length;
		const to = doc.content.size - 1 - ' words.'.length;
		const slice = doc.slice(from, to);
		expect(slice.openStart).toBeGreaterThan(0);
		const out = sliceToLatex(slice);
		expect(out).toContain('words of one paragraph.');
		expect(out).toContain('\\section{Middle}');
		expect(out).toContain('Second paragraph tail');
	});

	it('paste: LaTeX text parses into rich nodes, and copied labels are regenerated', () => {
		const frag = parseLatexFragment('\\section{Intro}\n\nHello $y$ world.\n\n\\begin{equation}\\label{eq:x}\nx = 1\n\\end{equation}\n');
		expect(frag).not.toBeNull();
		expect(frag!.child(0).type.name).toBe('heading');
		expect(frag!.child(1).type.name).toBe('paragraph');
		const eq = frag!.child(2);
		expect(eq.type.name).toBe('block_math');
		expect(eq.attrs.label).toBe('eq:x');
		const relabeled = regenerateCopiedLabels(new Slice(frag!, 0, 0)).content.child(2);
		expect(relabeled.attrs.label).toMatch(/^eq:x-copy-/);
	});

	it('gate: prose with a stray backslash stays plain, real LaTeX passes', () => {
		expect(looksLikeLatex('see C:\\Users\\lee for the file')).toBe(false);
		expect(looksLikeLatex('one \\mention of a command')).toBe(false);
		expect(looksLikeLatex('\\textbf{hi}')).toBe(true);
		expect(looksLikeLatex('\\begin{itemize}\\item a\\end{itemize}')).toBe(true);
		expect(looksLikeLatex('inline math $a+b$ counts')).toBe(true);
		expect(looksLikeLatex('\\alpha then \\beta')).toBe(true);
	});
});
