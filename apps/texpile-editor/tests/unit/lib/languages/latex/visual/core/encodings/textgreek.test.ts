// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { encodedText } from '$lib/languages/latex/visual/core/encodings/encodedText';
import { encodingTable } from '$lib/languages/latex/knowledge/commands/fontEncodings';
import { templateFeaturesStore } from '$lib/stores/editorStore';

const lgr = encodingTable('LGR')!;

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
});

describe('text in the LGR font encoding', () => {
	it('shows the letters LGR sets, with the accents and the final sigma its font ligates', () => {
		expect(encodedText('abgdezhjiklmnxoprstufqyw', lgr)).toBe('αβγδεζηθικλμνξοπρστυφχψω');
		expect(encodedText('logos ths s, ss', lgr)).toBe('λογος της ς, σς');
		expect(encodedText("'a `h \"i <'a >'h \"'i", lgr)).toBe('ά ὴ ϊ ἅ ἤ ΐ');
		// a breathing and an accent before a capital sit on it
		expect(encodedText("<A 'E", lgr)).toBe('Ἁ Έ');
	});

	it("draws the paper's own \\textgreek, the way LyX writes it, as the letters", () => {
		const macros = {
			textgreek: { def: '\\leavevmode{\\greektext #1}', args: 1 },
			greektext: { def: '\\fontencoding{LGR}\\selectfont\\def\\encodingdefault{LGR}', args: 0 }
		};
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros };
		expect(latexFace('\\textgreek{j}', false)?.dom.textContent).toBe('θ');
		expect(latexFace('\\textgreek{mhn}', false)?.dom.textContent).toBe('μην');
	});

	it('draws \\textgreek from the package data when the paper does not define it', () => {
		expect(latexFace('\\textgreek{qaris}', false)?.dom.textContent).toBe('χαρις');
	});
});
