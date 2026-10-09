// the words of a stretch of prose a dictionary does not know. Masked markup is blanks, so offsets are the source's
export type WordSpan = { offset: number; length: number };

/** digits, code-like names, and a capital after a small letter (LaTeX, iPhone): never words a dictionary would know */
const NOT_A_WORD = /[\d_]|\p{Ll}\p{Lu}/u;

const segmenters = new Map<string, Intl.Segmenter>();

function segmenterFor(locale: string): Intl.Segmenter {
	let segmenter = segmenters.get(locale);
	if (!segmenter) segmenters.set(locale, (segmenter = new Intl.Segmenter(locale, { granularity: 'word' })));
	return segmenter;
}

/** all capitals is an acronym, left alone; a curly apostrophe is looked up as a straight one, as the dictionaries spell it */
export function misspelledWords(text: string, locale: string, known: (word: string) => boolean): WordSpan[] {
	const spans: WordSpan[] = [];
	for (const { segment, index, isWordLike } of segmenterFor(locale).segment(text)) {
		if (!isWordLike || NOT_A_WORD.test(segment) || !/\p{Ll}/u.test(segment)) continue;
		if (!known(segment.replace(/’/g, "'"))) spans.push({ offset: index, length: segment.length });
	}
	return spans;
}
