// the languages the visual editor can hyphenate, and their pattern files (see patterns/NOTICE.md)
import { createHyphenator, type Hyphenator } from './liangHyphenation';

export type HyphenationLanguage = 'en-us' | 'en-gb' | 'de-1996' | 'fr' | 'es' | 'nl' | 'pl';

// TeX's \lefthyphenmin and \righthyphenmin for each, from the pattern file headers
const HYPHEN_MINS: Record<HyphenationLanguage, [left: number, right: number]> = {
	'en-us': [2, 3],
	'en-gb': [2, 3],
	'de-1996': [2, 2],
	fr: [2, 2],
	es: [2, 2],
	nl: [2, 2],
	pl: [2, 2]
};

const files = import.meta.glob<string>('./patterns/*.txt', { query: '?raw', import: 'default' });
const loaded = new Map<HyphenationLanguage, Promise<Hyphenator>>();
const ready = new Map<HyphenationLanguage, Hyphenator>();

/** the hyphenator for a language whose patterns are already in, without a wait */
export function readyHyphenator(language: HyphenationLanguage): Hyphenator | undefined {
	return ready.get(language);
}

export function loadHyphenator(language: HyphenationLanguage): Promise<Hyphenator> {
	let hyphenator = loaded.get(language);
	if (!hyphenator) {
		const [leftMin, rightMin] = HYPHEN_MINS[language];
		// not every language ships a list of exceptions
		const exceptions = files[`./patterns/hyph-${language}.hyp.txt`]?.() ?? Promise.resolve('');
		hyphenator = Promise.all([files[`./patterns/hyph-${language}.pat.txt`](), exceptions]).then(([patterns, listed]) => {
			const made = createHyphenator({ patterns, exceptions: listed, leftMin, rightMin });
			ready.set(language, made);
			return made;
		});
		loaded.set(language, hyphenator);
	}
	return hyphenator;
}
