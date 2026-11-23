// @codemirror/autocomplete's FuzzyMatcher and sort, which the package keeps to itself
import type { Completion, CompletionResult } from '@codemirror/autocomplete';

/** `matched` is the run of the label the typed text matched, which the list shows in bold */
export type MatchedOption = { option: Completion; from: number; to: number; score: number; matched: [number, number] | null };
type Scored = { score: number; matched: [number, number] | null };

const NOT_FULL = -100;
const CASE_FOLD = -200;
const NOT_START = -700;
const GAP = -1100;
/** as many as CodeMirror's list draws */
const SHOWN = 100;

function scoreOf(word: string, pattern: string): Scored | null {
	if (!pattern) return { score: NOT_FULL, matched: null };
	function run(at: number): [number, number] {
		return [at, at + pattern.length];
	}
	const full = word.length === pattern.length ? 0 : NOT_FULL;
	if (word.startsWith(pattern)) return { score: full, matched: run(0) };
	const lowerWord = word.toLowerCase();
	const lowerPattern = pattern.toLowerCase();
	if (lowerWord.startsWith(lowerPattern)) return { score: CASE_FOLD + full, matched: run(0) };
	const at = word.indexOf(pattern);
	if (at >= 0) return { score: NOT_START + NOT_FULL, matched: run(at) };
	const folded = lowerWord.indexOf(lowerPattern);
	if (folded >= 0) return { score: NOT_START + CASE_FOLD + NOT_FULL, matched: run(folded) };
	let i = 0;
	for (const ch of lowerWord) if (ch === lowerPattern[i]) i++;
	if (i < lowerPattern.length) return null;
	return { score: GAP + (lowerWord[0] === lowerPattern[0] ? 0 : NOT_START) + NOT_FULL, matched: null };
}

/** the options of every result that match what is typed between its `from` and `pos`, best first */
export function matchOptions(results: readonly CompletionResult[], doc: string, pos: number): MatchedOption[] {
	const found: MatchedOption[] = [];
	for (const result of results) {
		const to = result.to ?? pos;
		const typed = doc.slice(result.from, pos);
		for (const option of result.options) {
			// unfiltered options keep their order, ahead of the rest
			if (result.filter === false) found.push({ option, from: result.from, to, score: 1e9 - found.length, matched: null });
			else {
				const scored = scoreOf(option.label, typed);
				if (scored) found.push({ option, from: result.from, to, score: scored.score + (option.boost ?? 0), matched: scored.matched });
			}
		}
	}
	found.sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label));
	const kept = found.filter((match, i) => {
		const before = found[i - 1]?.option;
		return !before || before.label !== match.option.label || before.detail !== match.option.detail || before.type !== match.option.type;
	});
	return kept.slice(0, SHOWN);
}
