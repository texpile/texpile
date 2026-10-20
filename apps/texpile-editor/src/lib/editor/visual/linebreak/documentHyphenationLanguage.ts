// which hyphenation patterns a document's own source asks for
import { declaredLanguage, declaredLanguageTags } from '$lib/editor/declaredLanguage';
import type { HyphenationLanguage } from './hyphenationLanguages';

// by the language of a tag, or its region where that differs
const PATTERNS_BY_TAG: Record<string, HyphenationLanguage> = {
	'en-GB': 'en-gb',
	'en-AU': 'en-gb',
	'en-NZ': 'en-gb',
	en: 'en-us',
	de: 'de-1996',
	fr: 'fr',
	es: 'es',
	nl: 'nl',
	pl: 'pl'
};

/** 'none' for a language without patterns here: English splits in Italian words would be wrong ones */
export type DocumentHyphenation = HyphenationLanguage | 'none';

/** undefined when the source names no language */
export function documentHyphenationLanguage(source: string): DocumentHyphenation | undefined {
	const named = declaredLanguage(source);
	if (!named) return undefined;
	for (const tag of declaredLanguageTags(named)) {
		const [language, ...rest] = tag.split('-');
		const region = rest.find((part) => part.length === 2);
		const patterns = PATTERNS_BY_TAG[`${language}-${region}`] ?? PATTERNS_BY_TAG[language];
		if (patterns) return patterns;
	}
	return 'none';
}
