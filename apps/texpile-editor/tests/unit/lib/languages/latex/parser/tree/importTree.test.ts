import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';

function nodesNamed(doc: Node, name: string): Node[] {
	const out: Node[] = [];
	doc.descendants((n) => {
		if (n.type.name === name) out.push(n);
	});
	return out;
}

describe('treeToProseMirror', () => {
	it('keeps what comes before a \\begin{document} nothing ends', () => {
		const { doc } = treeToProseMirror('\\newcommand{\\x}{y}\nBefore.\n\n\\begin{document}\n\nAfter.\n');
		expect(doc.textContent).toContain('Before.');
		expect(doc.textContent).toContain('After.');
	});

	it('reads citation keys without the comment between them', () => {
		const { doc } = treeToProseMirror('See \\cite{a,%\n  b}.\n');
		expect(nodesNamed(doc, 'citation').map((n) => n.textContent)).toEqual(['a,b']);
	});

	it('keeps an \\indent inside a paragraph', () => {
		const { doc } = treeToProseMirror('One.\\\\\n\\indent Two.\n');
		expect(nodesNamed(doc, 'inline_latex').map((n) => n.textContent)).toContain('\\indent');
	});

	it('keeps the braces of a cell that is one group, which an S column reads as text', () => {
		const { doc } = treeToProseMirror('\\begin{tabular}{lS}\nName & {Percent} \\\\\na & 1.5\n\\end{tabular}\n');
		expect(nodesNamed(doc, 'inline_latex').map((n) => n.textContent)).toContain('{Percent}');
	});
});
