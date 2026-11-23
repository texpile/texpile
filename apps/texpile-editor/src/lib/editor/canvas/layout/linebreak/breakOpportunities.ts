// where a paragraph's text may end a line, by the rules the browser breaks with: Unicode's (UAX #14, through
// linebreak) and, for the scripts those rules hand to a dictionary, the browser's own word segmenter
import LineBreaker from 'linebreak';

/**
 * required: a newline. spaces: after a run of spaces. ideographic: between characters the browser spreads apart when
 * it justifies (Chinese, Japanese, Korean). word: between dictionary words with nothing between them (Thai and its
 * neighbours). joint: after a hyphen, dash or slash inside what is otherwise one word. end: the text's end
 */
export type BreakKind = 'required' | 'spaces' | 'ideographic' | 'word' | 'joint' | 'end';

/** the next line starts at `at`; from `dropFrom` to `at` are the spaces, and the newline, the line ends on */
export type BreakOpportunity = { at: number; dropFrom: number; kind: BreakKind };

// what Blink spaces out when it justifies: Han, kana, Hangul, Yi, Bopomofo, CJK punctuation and fullwidth forms
const IDEOGRAPHIC =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\p{Script=Hangul}\p{Script=Yi}\u3000-\u303f\uff00-\uffef]/u;
// UAX #14's SA class, whose breaks come from a dictionary
const COMPLEX_CONTEXT = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

let segmenter: Intl.Segmenter | undefined;

// word boundaries with dictionary script on both sides; a Latin word run into a Thai one stays joined, as in ICU
function wordBreaks(text: string, from: number, to: number): number[] {
	segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
	const found: number[] = [];
	let afterWord = false;
	for (const segment of segmenter.segment(text.slice(from, to))) {
		const word = segment.isWordLike === true && COMPLEX_CONTEXT.test(segment.segment);
		if (segment.index > 0 && word && afterWord) found.push(from + segment.index);
		afterWord = word;
	}
	return found;
}

function kindOf(text: string, at: number, dropFrom: number, required: boolean): BreakKind {
	if (at === text.length) return 'end';
	if (required) return 'required';
	if (dropFrom < at) return 'spaces';
	return IDEOGRAPHIC.test(text[at - 1]) || IDEOGRAPHIC.test(text[at]) ? 'ideographic' : 'joint';
}

export function breakOpportunities(text: string): BreakOpportunity[] {
	const found: BreakOpportunity[] = [];
	const breaker = new LineBreaker(text);
	let start = 0;
	for (let next = breaker.nextBreak(); next; next = breaker.nextBreak()) {
		const { position: at } = next;
		// a newline ending the text leaves an empty last line, as ProseMirror's trailing break shows it
		const trailing = at === text.length && text.endsWith('\n');
		const required = next.required || trailing;
		let dropFrom = required ? at - 1 : at;
		while (dropFrom > start && text[dropFrom - 1] === ' ') dropFrom--;
		if (COMPLEX_CONTEXT.test(text.slice(start, dropFrom)))
			for (const inner of wordBreaks(text, start, dropFrom)) found.push({ at: inner, dropFrom: inner, kind: 'word' });
		if (trailing) found.push({ at, dropFrom, kind: 'required' });
		found.push({ at, dropFrom: trailing ? at : dropFrom, kind: kindOf(text, at, dropFrom, required) });
		start = at;
	}
	return found;
}
