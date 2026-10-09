// what a dictionary is asked about: whole words with their elisions, never acronyms, numbers or names of code
import { describe, it, expect } from 'vitest';
import { misspelledWords } from '$lib/editor/spellcheck/languages/misspelledWords';

function flagged(text: string, locale: string, known: string[]): string[] {
	const words = new Set(known);
	return misspelledWords(text, locale, (word) => words.has(word)).map(({ offset, length }) => text.slice(offset, offset + length));
}

describe('misspelledWords', () => {
	it('keeps an elision one word and looks a curly apostrophe up as a straight one', () => {
		expect(flagged('L’ordinateur d’aujourd’hui', 'fr', ["L'ordinateur", "d'aujourd'hui"])).toEqual([]);
		expect(flagged("dell'anno", 'it', ['anno'])).toEqual(["dell'anno"]);
	});

	it('passes over acronyms, numbers, code names and mixed capitals', () => {
		expect(flagged('NASA 2024 user_id LaTeX iPhone Hauss', 'de', [])).toEqual(['Hauss']);
	});

	it('splits words at the markers a chip leaves in a visual block, with offsets into the block', () => {
		const block = 'Poincaré und  Fehlr';
		const spans = misspelledWords(block, 'de', (word) => word === 'und' || word === 'Poincaré');
		expect(spans).toEqual([{ offset: block.indexOf('Fehlr'), length: 5 }]);
	});
});
