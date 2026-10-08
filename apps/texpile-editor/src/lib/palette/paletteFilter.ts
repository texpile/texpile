// Fuzzy matching for the command palette.
//
// Subsequence matching, the same rule every palette uses: "opf" finds "Open folder" and "sec2.tex"
// finds "chapters/section-2.tex". A plain substring test would not, and that is the whole point of
// typing three letters instead of nine.

/** how a match scored, plus the matched character offsets so the UI can highlight them */
export type FuzzyMatch = {
	score: number;
	/** indices into the haystack, ascending */
	hits: number[];
};

const BONUS_START = 12; // match at the very beginning
const BONUS_WORD = 8; // match right after a separator, so "of" hits "open Folder"
const BONUS_RUN = 4; // consecutive characters, which is what makes an exact substring win
const PENALTY_SKIP = 1; // per skipped haystack character

/** true for the character positions a word can start at */
function isWordStart(hay: string, i: number): boolean {
	if (i === 0) return true;
	const prev = hay[i - 1];
	if (prev === ' ' || prev === '/' || prev === '\\' || prev === '-' || prev === '_' || prev === '.') return true;
	// camelCase boundary
	return prev === prev.toLowerCase() && hay[i] !== hay[i].toLowerCase();
}

/**
 * Score `needle` against `haystack`, or null when it does not match at all.
 *
 * Greedy left-to-right rather than an optimal alignment: a palette list is short, the query is a
 * few characters, and the difference in ranking is not worth a DP table per item per keystroke.
 * The one concession to quality is that a run is preferred over an earlier isolated hit, which is
 * what stops "tex" from matching t-e-x scattered across a long path when a real "tex" exists later.
 */
export function fuzzyScore(haystack: string, needle: string): FuzzyMatch | null {
	if (!needle) return { score: 0, hits: [] };
	const hay = haystack.toLowerCase();
	const need = needle.toLowerCase();
	// a jump to a nicer word start can strand the letters after it; every subsequence still matches
	return scoreFrom(hay, need, true) ?? scoreFrom(hay, need, false);
}

function scoreFrom(hay: string, need: string, preferWordStarts: boolean): FuzzyMatch | null {
	const hits: number[] = [];
	let score = 0;
	let at = 0;
	let run = 0;

	for (let n = 0; n < need.length; n++) {
		const ch = need[n];
		// prefer a word-start occurrence over the next raw occurrence, but only when one exists
		// within reach - scanning to the end of a long path for a nicer boundary would let a late
		// match beat an obvious early one
		let idx = hay.indexOf(ch, at);
		if (idx === -1) return null;
		// a letter right after the last hit continues it, however the word goes on
		if (preferWordStarts && !isWordStart(hay, idx) && !(n > 0 && idx === at)) {
			const better = (() => {
				for (let i = idx + 1; i < hay.length; i++) if (hay[i] === ch && isWordStart(hay, i)) return i;
				return -1;
			})();
			if (better !== -1) idx = better;
		}
		const skipped = idx - at;
		if (skipped === 0 && n > 0) {
			run++;
			score += BONUS_RUN * run;
		} else {
			run = 0;
			score -= Math.min(skipped, 10) * PENALTY_SKIP;
		}
		if (idx === 0) score += BONUS_START;
		else if (isWordStart(hay, idx)) score += BONUS_WORD;
		hits.push(idx);
		at = idx + 1;
	}
	// shorter haystacks win ties: "Save" should beat "Save and compile" for "save"
	score -= Math.floor(hay.length / 8);
	return { score, hits };
}

/** split a string into matched / unmatched runs, for rendering the highlight */
export function highlightRuns(text: string, hits: number[]): { text: string; hit: boolean }[] {
	if (!hits.length) return [{ text, hit: false }];
	const runs: { text: string; hit: boolean }[] = [];
	const marked = new Set(hits);
	let buf = '';
	let bufHit = marked.has(0);
	for (let i = 0; i < text.length; i++) {
		const hit = marked.has(i);
		if (hit !== bufHit) {
			if (buf) runs.push({ text: buf, hit: bufHit });
			buf = '';
			bufHit = hit;
		}
		buf += text[i];
	}
	if (buf) runs.push({ text: buf, hit: bufHit });
	return runs;
}
