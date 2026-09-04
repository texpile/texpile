// exact anchoring: build a quote-plus-context anchor and find it again, ranking candidate
// hits by how much of the remembered context still lines up
/** how much text either side is kept, to tell repeated quotes apart */
export const CONTEXT = 32;

/**
 * A quote long enough to be worth searching for. A one- or two-character quote appears everywhere
 * and its context decides the match on its own, which is guesswork dressed up as a result.
 */
export const MIN_QUOTE = 3;

/** a runaway scan guard: past this many hits the quote is not distinctive enough to place */
export const MAX_HITS = 500;

export type CommentAnchor = {
	/** the commented text itself */
	quote: string;
	/** text immediately before and after it, used to pick between repeats of the quote */
	prefix: string;
	suffix: string;
	/** where the quote sat when the comment was written; re-checked, never trusted */
	start: number;
	end: number;
};

export type ResolvedAnchor = {
	from: number;
	to: number;
	/** the offsets were still right - nothing has moved under this comment */
	exact: boolean;
	/**
	 * Found, but under WEAK_CONTEXT characters of the remembered surroundings line up. The words
	 * around the quote changed, and if the document holds the sentence twice this may be the OTHER
	 * copy: a single surviving copy is taken on the strength of the quote alone, because from here
	 * a sentence moved into a new paragraph looks exactly the same. Placed with a warning rather
	 * than detached - a reader loses a glance to the warning and a whole thread to a detach.
	 */
	weak: boolean;
};

/** matched context characters (both sides together) under which a relocated hit is weak. What a
 *  duplicate shares by chance - a period and two newlines each side - scores about five. */
export const WEAK_CONTEXT = 8;

export function buildAnchor(text: string, from: number, to: number): CommentAnchor {
	return {
		quote: text.slice(from, to),
		prefix: text.slice(Math.max(0, from - CONTEXT), from),
		suffix: text.slice(to, Math.min(text.length, to + CONTEXT)),
		start: from,
		end: to
	};
}

/**
 * Find the anchor in `text`, or null if it has gone.
 *
 * Null means orphaned, and an orphaned comment must be SHOWN as orphaned rather than pinned to a
 * best guess: a review note parked on the wrong sentence is worse than one that admits it lost its
 * place, because the reader has no way to tell it is lying.
 */
export function resolveAnchor(text: string, a: CommentAnchor): ResolvedAnchor | null {
	if (a.quote.length < MIN_QUOTE) return null;
	// the common case by far - the file has not been touched behind our back
	if (text.slice(a.start, a.end) === a.quote) return { from: a.start, to: a.end, exact: true, weak: false };
	const hit = searchQuote(text, a.quote, a.prefix, a.suffix, a.start);
	return hit ? { from: hit.from, to: hit.to, exact: false, weak: hit.context < WEAK_CONTEXT } : null;
}

/** the search behind resolveAnchor, shared with the loose path; `hint` breaks exact-score ties,
 *  `context` is how much of the surroundings matched at the pick (see ResolvedAnchor.weak) */
export function searchQuote(
	text: string,
	quote: string,
	prefix: string,
	suffix: string,
	hint: number
): { from: number; to: number; context: number } | null {
	if (quote.length < MIN_QUOTE) return null;
	const hits = occurrences(text, quote);
	if (hits.length === 0) return null;
	// Too common to place. The scan stops at MAX_HITS, so scoring what it collected would rank the
	// first 500 copies and ignore the rest - and a comment on `\begin` in a long document would land
	// confidently near the top of the file, which is precisely the lie this module exists to avoid.
	// Orphaned is the honest answer for a quote this repetitive.
	if (hits.length >= MAX_HITS) return null;
	const a = { quote, prefix, suffix };
	if (hits.length === 1)
		return { from: hits[0], to: hits[0] + quote.length, context: contextScore(text, hits[0], hits[0] + quote.length, a) };

	// repeated quote: the context decides. Ties go to whichever copy is nearest where the comment
	// used to be, since edits move text a little more often than they move it a long way.
	let best = hits[0];
	let bestScore = -1;
	for (const at of hits) {
		const score = contextScore(text, at, at + quote.length, a);
		if (score > bestScore || (score === bestScore && Math.abs(at - hint) < Math.abs(best - hint))) {
			bestScore = score;
			best = at;
		}
	}
	return { from: best, to: best + quote.length, context: bestScore };
}

/** how many characters of the remembered context still line up around a candidate */
export function contextScore(text: string, from: number, to: number, a: Pick<CommentAnchor, 'prefix' | 'suffix'>): number {
	let score = 0;
	const before = text.slice(Math.max(0, from - a.prefix.length), from);
	for (let i = 1; i <= Math.min(before.length, a.prefix.length); i++) {
		if (before[before.length - i] !== a.prefix[a.prefix.length - i]) break;
		score++;
	}
	const after = text.slice(to, to + a.suffix.length);
	for (let i = 0; i < Math.min(after.length, a.suffix.length); i++) {
		if (after[i] !== a.suffix[i]) break;
		score++;
	}
	return score;
}

export function occurrences(text: string, needle: string): number[] {
	const out: number[] = [];
	for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
		out.push(at);
		if (out.length >= MAX_HITS) break;
	}
	return out;
}
