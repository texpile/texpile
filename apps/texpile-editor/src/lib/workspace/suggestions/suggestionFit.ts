// where a file's open suggestions stand in its text: found by their recorded words, or kept where the editor carried
// them, and for a reader who does not record, its own drawing until the recorder's record catches up
import { resolveExactly } from '$lib/comments/anchorSearch';
import type { CommentThread } from '$lib/comments/log';
import type { PlacedSuggestion } from '$lib/comments/suggestCompare';
import { isOpenSuggestion, suggestionAuthor } from '$lib/comments/suggest';

/** where the editor last had each suggestion, with its place in the list */
export type Carried = Map<string, PlacedSuggestion & { i: number }>;

/** the reader the suggestions are fitted for */
type Reader = {
	/** records suggestions itself */
	compares: boolean;
	/** an event from the recorder arrived since the last fit */
	caughtUp: boolean;
	/** the suggestions a reader who does not record drew from its own typing */
	drawnHere: Set<string>;
};

/** `lost`: open suggestions that could not be placed; `drawnHere`: the reader's own drawing still shown */
export function fitSuggestions(
	threads: CommentThread[],
	against: string,
	carried: Carried,
	o: Reader
): { kept: PlacedSuggestion[]; lost: Set<string>; drawnHere: Set<string> } {
	const placed: PlacedSuggestion[] = [];
	const order = new Map<string, number>();
	const lost = new Set<string>();
	const known = new Set<string>();
	const waiting: string[] = [];
	for (const t of threads.filter(isOpenSuggestion)) {
		known.add(t.id);
		const base = { id: t.id, restore: t.restore ?? '', author: suggestionAuthor(t) };
		// a reader who does not record takes the recorder's word for where a suggestion stands, and
		// only falls back on its own reckoning while that anchor has not caught up with the text
		const s = carried.get(t.id);
		const hit = s && o.compares ? null : resolveExactly(against, t.anchor);
		if (hit) placed.push({ ...base, from: hit.from, to: hit.to });
		else if (s) placed.push({ ...base, from: s.from, to: s.to });
		else waiting.push(t.id);
		order.set(t.id, s && !hit ? s.i : carried.size + (t.anchor.rank ?? 0));
	}
	// and draws its own edits until the recorder's record of them lands on the same words, or an event
	// from the recorder finds every record in place: a record that cannot be placed yet is of text that
	// has moved on since, which its own suggestions show. Not by author: two people's edits to one word
	// can come back as the other's
	const caughtUp = o.caughtUp && waiting.length === 0;
	const own = caughtUp
		? []
		: [...carried.values()].filter((s) => o.drawnHere.has(s.id) && !placed.some((p) => s.from <= p.to && s.to >= p.from));
	for (const s of own) {
		placed.push({ id: s.id, from: s.from, to: s.to, restore: s.restore, author: s.author });
		order.set(s.id, s.i);
	}
	if (own.length === 0) for (const id of waiting) lost.add(id);
	placed.sort((a, b) => a.from - b.from || a.to - b.to || order.get(a.id)! - order.get(b.id)!);
	const kept: PlacedSuggestion[] = [];
	for (const s of placed) {
		const prev = kept[kept.length - 1];
		if (!prev || s.from >= prev.to) kept.push(s);
		else if (known.has(s.id)) lost.add(s.id);
	}
	return { kept, lost, drawnHere: new Set(own.map((s) => s.id)) };
}
