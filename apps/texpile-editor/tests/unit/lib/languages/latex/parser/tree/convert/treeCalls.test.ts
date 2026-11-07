// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

function chips(doc: Node): string[] {
	const out: string[] = [];
	doc.descendants((n) => {
		if (n.type.name === 'inline_latex') out.push(n.textContent);
	});
	return out;
}

describe('register assignments', () => {
	it('keeps the value TeX assigns a register with it, and draws it as a setting', () => {
		const { doc } = treeToProseMirror('Table 1.\\begingroup\\tabcolsep=4pt\nNext \\parindent 0pt words.\n');
		expect(chips(doc)).toEqual(['\\begingroup\\tabcolsep=4pt', '\\parindent 0pt']);
		expect(latexFace('\\begingroup\\tabcolsep=4pt', false)?.dom.textContent).toContain('4pt');
	});

	it('ends a value at the paragraph end, before the heading after it', () => {
		const { doc } = treeToProseMirror('Words.\\looseness=-1\n\n\\section{Next}\n');
		expect(chips(doc)).toEqual(['\\looseness=-1']);
	});
});
