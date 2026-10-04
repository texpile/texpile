// what each copy in Version History is, for its row: how many words changed since the copy before it, and whether
// it is what the file holds now
import { diffWords } from 'diff';
import type { LocalHistoryEntry } from './localHistory.svelte';

/** `words`: null for the oldest copy, which has nothing before it, and 'many' past what is worth counting */
export type CopyStats = { same: boolean; words: number | 'many' | null };

// a whole file rewritten would take a word diff seconds; past this many changed words it is "many changes"
const MAX_EDITS = 3000;

/** words added and removed between two texts */
export function wordsChanged(before: string, after: string): number | 'many' {
	const parts = diffWords(before, after, { maxEditLength: MAX_EDITS });
	if (!parts) return 'many';
	let n = 0;
	for (const p of parts) if (p.added || p.removed) n += p.value.match(/\S+/g)?.length ?? 0;
	return n;
}

/** every copy's stats, newest first as the list is; `read` gives a copy's text, `now` the file's (null: deleted) */
export async function copyStats(
	entries: LocalHistoryEntry[],
	read: (id: string) => Promise<string | null>,
	now: string | null
): Promise<Map<string, CopyStats>> {
	const texts = await Promise.all(entries.map((e) => read(e.id)));
	const out = new Map<string, CopyStats>();
	entries.forEach((e, i) => {
		const text = texts[i];
		const older = texts[i + 1];
		const words = text === null || older === undefined || older === null ? null : wordsChanged(older, text);
		out.set(e.id, { same: text !== null && text === now, words });
	});
	return out;
}
