import { describe, expect, it } from 'vitest';
import { isBabelLanguageName, languageTagsOf } from '$lib/languages/latex/knowledge/registries/languageTags';

describe('languageTagsOf', () => {
	it('puts a polyglossia variant first and reads babel aliases in lowercase', () => {
		expect(languageTagsOf('portuguese', 'brazilian')[0]).toBe('pt-BR');
		expect(languageTagsOf('usenglish')).toContain('en-US');
		expect(languageTagsOf('nothing-like-this')).toEqual([]);
	});

	it('keeps every tag of a name two files give differently', () => {
		expect(languageTagsOf('swissgerman')).toEqual(expect.arrayContaining(['gsw', 'de-CH-1996']));
	});
});

describe('isBabelLanguageName', () => {
	it('knows names and aliases but not class options', () => {
		expect(isBabelLanguageName('ngerman')).toBe(true);
		expect(isBabelLanguageName('a4paper')).toBe(false);
	});
});
