import { describe, expect, it } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { citationText } from '$lib/editor/visual/extensions/citation/citationText';

const citations = (source: string) => {
	const found: Array<[string, string]> = [];
	treeToProseMirror(source).doc.descendants((node) => {
		if (node.type.name === 'citation') found.push([String(node.attrs.variant), node.textContent]);
	});
	return found;
};

describe('citation commands', () => {
	it('reads every command the data gives a cite form as a citation, starred or not', () => {
		expect(citations(String.raw`A \citealp{a} and \citeauthor{b}, \citeyear{c}, \Citet*{d}.`)).toEqual([
			['citealp', 'a'],
			['citeauthor', 'b'],
			['citeyear', 'c'],
			['Citet*', 'd']
		]);
	});

	it('writes them back as they were, notes and star included', () => {
		const source = String.raw`See \citep*[see][p. 3]{a, b} and \citealt[p. 3]{c}.`;
		expect(serializeToLatex(treeToProseMirror(source).doc)).toContain(String.raw`\citep*[see][p. 3]{a, b} and \citealt[p. 3]{c}`);
	});

	it('prints what each form prints', () => {
		const work = [{ author: 'Knuth', year: '1976', title: 'Literate programming' }];
		expect(citationText('citealp', work, '', '')).toBe('Knuth 1976');
		expect(citationText('citeauthor', work, '', '')).toBe('Knuth');
		expect(citationText('citeyear', work, '', '')).toBe('1976');
		expect(citationText('Citet', work, '', '')).toBe('Knuth (1976)');
		expect(citationText('citetitle', work, '', '')).toBe('Literate programming');
	});
});
