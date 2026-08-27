// The citation menu used to offer a fixed biblatex list to everyone, so picking "Parenthetical" in
// a natbib document wrote \parencite - an undefined command, and a failed build. What a document
// can compile is something its own preamble answers.
import { describe, it, expect } from 'vitest';
import { citationVariantsFor } from '$lib/languages/latex/visual/extensions/citation/citationVariantsFor';

const CLASS = '\\documentclass{article}\n';

describe('the commands a document can compile', () => {
	it('are biblatex\u2019s when it loads biblatex', () => {
		expect(citationVariantsFor(`${CLASS}\\usepackage[style=authoryear]{biblatex}`)).toEqual(['cite', 'parencite', 'textcite']);
	});

	it('are natbib\u2019s when it loads natbib', () => {
		expect(citationVariantsFor(`${CLASS}\\usepackage{natbib}`)).toEqual(['cite', 'citep', 'citet']);
	});

	// this is the case the old fixed list broke: three of its four options were undefined here
	it('are \\cite alone with plain bibtex, so the menu has nothing to ask', () => {
		expect(citationVariantsFor(`${CLASS}\\bibliographystyle{plain}`)).toEqual(['cite']);
	});

	it('are found in a comma list, and behind package options', () => {
		expect(citationVariantsFor(`${CLASS}\\usepackage{graphicx,natbib,amsmath}`)).toEqual(['cite', 'citep', 'citet']);
		expect(citationVariantsFor(`${CLASS}\\usepackage[round]{natbib}`)).toEqual(['cite', 'citep', 'citet']);
	});

	it('prefer biblatex when a document somehow loads both', () => {
		expect(citationVariantsFor(`${CLASS}\\usepackage{natbib}\n\\usepackage{biblatex}`)).toEqual(['cite', 'parencite', 'textcite']);
	});
});

describe('a file with no preamble of its own', () => {
	// an included chapter, not a document without packages: narrowing here would collapse the menu
	// to one option in every multi-file project
	it('narrows nothing, rather than guessing', () => {
		expect(citationVariantsFor('')).toBeUndefined();
		expect(citationVariantsFor('\\section{A chapter}\n\nSome prose \\citet{a}.')).toBeUndefined();
	});
});
