// the languages spelling is checked in: English by Harper, the rest by a CSpell dictionary built in at build time.
// no imports, so the build step (scripts/spellDictionaries.ts) reads the same table

/** each dictionary language, and the CSpell package it is built from */
export const DICTIONARY_PACKAGES = {
	de: '@cspell/dict-de-de',
	fr: '@cspell/dict-fr-fr',
	es: '@cspell/dict-es-es',
	it: '@cspell/dict-it-it',
	nl: '@cspell/dict-nl-nl',
	'pt-BR': '@cspell/dict-pt-br',
	'pt-PT': '@cspell/dict-pt-pt',
	pl: '@cspell/dict-pl_pl'
} as const;

export type DictionaryLanguage = keyof typeof DICTIONARY_PACKAGES;
export type SpellLanguage = 'en' | DictionaryLanguage;

export const DICTIONARY_LANGUAGES = Object.keys(DICTIONARY_PACKAGES) as DictionaryLanguage[];
export const SPELL_LANGUAGES: readonly SpellLanguage[] = ['en', ...DICTIONARY_LANGUAGES];

/** where the built dictionaries sit, beside the bundle */
export const DICTIONARY_DIR = 'spell';

export function isSpellLanguage(value: unknown): value is SpellLanguage {
	return typeof value === 'string' && (SPELL_LANGUAGES as readonly string[]).includes(value);
}

export function isDictionaryLanguage(value: unknown): value is DictionaryLanguage {
	return value !== 'en' && isSpellLanguage(value);
}

/** what a built dictionary is loaded with, from its package's cspell-ext.json */
export type DictionaryOptions = {
	caseSensitive: boolean;
	repMap?: [string, string][];
	dictionaryInformation?: Record<string, unknown>;
};
