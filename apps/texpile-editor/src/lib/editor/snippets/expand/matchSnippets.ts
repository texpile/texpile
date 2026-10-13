import type { Snippet, SnippetLanguage } from '../file/snippetTypes';

export type CompiledSnippet = {
	snippet: Snippet;
	lang: SnippetLanguage;
	body: string;
	/** regex snippets only, one per prefix, anchored at the cursor */
	patterns: RegExp[] | null;
	word: boolean;
};

export type SnippetMatch = { compiled: CompiledSnippet; from: number; captures: string[] };

/** how much of the line regex triggers see, to keep keystrokes cheap */
export const REGEX_WINDOW = 100;

const LAYER_RANK = { builtin: 0, global: 1, project: 2 } as const;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** a trigger inside a command name like \iint is part of that name */
function startsInCommandName(before: string, start: number): boolean {
	let i = start;
	while (i > 0 && /[a-zA-Z@]/.test(before[i - 1])) i--;
	return i > 0 && before[i - 1] === '\\' && /[a-zA-Z@]/.test(before[start] ?? '');
}

/** a trigger inside an @ name like @vf is part of that name */
function startsInAtName(before: string, start: number): boolean {
	let i = start;
	while (i > 0 && /[a-zA-Z0-9]/.test(before[i - 1])) i--;
	return i > 0 && before[i - 1] === '@';
}

function boundaryOk(compiled: CompiledSnippet, before: string, start: number): boolean {
	if (startsInCommandName(before, start) || startsInAtName(before, start)) return false;
	return !compiled.word || start === 0 || !WORD_CHAR.test(before[start - 1]);
}

export function autoMatches(list: readonly CompiledSnippet[], before: string, beforeStart: number): SnippetMatch[] {
	const found: (SnippetMatch & { length: number })[] = [];
	const windowStart = Math.max(0, before.length - REGEX_WINDOW);
	const window = before.slice(windowStart);
	for (const compiled of list) {
		if (compiled.patterns) {
			for (const re of compiled.patterns) {
				const m = re.exec(window);
				if (!m || !m[0]) continue;
				const start = windowStart + m.index;
				if (!boundaryOk(compiled, before, start)) continue;
				found.push({ compiled, from: beforeStart + start, captures: m.slice(1).map((g) => g ?? ''), length: m[0].length });
				break;
			}
			continue;
		}
		for (const prefix of compiled.snippet.prefixes) {
			if (!before.endsWith(prefix)) continue;
			const start = before.length - prefix.length;
			if (!boundaryOk(compiled, before, start)) continue;
			found.push({ compiled, from: beforeStart + start, captures: [], length: prefix.length });
			break;
		}
	}
	return found
		.sort(
			(a, b) =>
				b.compiled.snippet.priority - a.compiled.snippet.priority ||
				b.length - a.length ||
				LAYER_RANK[b.compiled.snippet.layer] - LAYER_RANK[a.compiled.snippet.layer]
		)
		.map(({ compiled, from, captures }) => ({ compiled, from, captures }));
}

export type PopupCandidates = { from: number; items: { compiled: CompiledSnippet; prefix: string }[] };

/** a word prefix needs two letters typed */
export function popupCandidates(list: readonly CompiledSnippet[], before: string, beforeStart: number): PopupCandidates | null {
	let best: PopupCandidates | null = null;
	for (const compiled of list) {
		for (const prefix of compiled.snippet.prefixes) {
			const min = WORD_CHAR.test(prefix[0]) ? 2 : 1;
			for (let k = Math.min(prefix.length, before.length); k >= min; k--) {
				if (!before.endsWith(prefix.slice(0, k))) continue;
				const start = before.length - k;
				if (WORD_CHAR.test(prefix[0]) && start > 0 && WORD_CHAR.test(before[start - 1])) break;
				if (startsInCommandName(before, start)) break;
				const from = beforeStart + start;
				if (!best || from < best.from) best = { from, items: [] };
				if (from === best.from) best.items.push({ compiled, prefix });
				break;
			}
		}
	}
	return best;
}
