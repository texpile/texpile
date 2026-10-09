// which hyphenation patterns a document's own source asks for
import { declaredLanguage } from '$lib/editor/declaredLanguage';
import type { HyphenationLanguage } from './hyphenationLanguages';

// babel and polyglossia names, Typst and Markdown language codes
const BY_NAME: Record<string, HyphenationLanguage> = {
	english: 'en-us',
	american: 'en-us',
	usenglish: 'en-us',
	en: 'en-us',
	british: 'en-gb',
	ukenglish: 'en-gb',
	'en-gb': 'en-gb',
	german: 'de-1996',
	ngerman: 'de-1996',
	austrian: 'de-1996',
	naustrian: 'de-1996',
	de: 'de-1996',
	french: 'fr',
	francais: 'fr',
	fr: 'fr',
	spanish: 'es',
	es: 'es',
	dutch: 'nl',
	nl: 'nl',
	polish: 'pl',
	pl: 'pl'
};

/** 'none' for a language without patterns here: English splits in Italian words would be wrong ones */
export type DocumentHyphenation = HyphenationLanguage | 'none';

/** undefined when the source names no language */
export function documentHyphenationLanguage(source: string): DocumentHyphenation | undefined {
	const named = declaredLanguage(source);
	if (!named) return undefined;
	if (named.name === 'english' && named.variant === 'british') return 'en-gb';
	return BY_NAME[named.name] ?? 'none';
}
