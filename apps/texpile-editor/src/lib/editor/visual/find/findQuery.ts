import type { FindOptions } from '$lib/editor/find/findOptions';

export type FindQuery = FindOptions & { search: string; replace: string };

/** a stretch of a string that matched */
export type TextHit = { from: number; to: number };

export type FindMatcher = {
	hitsIn(text: string): TextHit[];
	/** what replaces one matched text; a regex's $1 and $& are filled in */
	replacementFor(matched: string): string;
};

const WORD = /[\p{L}\p{N}_]/u;

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** null for an empty query or a regex not finished yet */
export function compileFind(query: FindQuery): FindMatcher | null {
	if (!query.search) return null;
	const flags = `gu${query.caseSensitive ? '' : 'i'}`;
	let pattern: RegExp;
	try {
		pattern = new RegExp(query.regexp ? query.search : escape(query.search), flags);
	} catch {
		return null;
	}
	const one = new RegExp(pattern.source, flags.replace('g', ''));
	return {
		hitsIn(text) {
			const hits: TextHit[] = [];
			pattern.lastIndex = 0;
			for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
				// a match of nothing has no text to show or replace
				if (!m[0]) {
					pattern.lastIndex++;
					continue;
				}
				const from = m.index;
				const to = from + m[0].length;
				if (query.wholeWord && (WORD.test(text[from - 1] ?? '') || WORD.test(text[to] ?? ''))) continue;
				hits.push({ from, to });
			}
			return hits;
		},
		replacementFor(matched) {
			return query.regexp ? matched.replace(one, query.replace) : query.replace;
		}
	};
}
