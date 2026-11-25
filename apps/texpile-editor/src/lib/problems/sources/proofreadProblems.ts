// Harper's findings in a source file, with the AI's review where one is in, as rows
import { sourceProseInWorker } from '$lib/editor/spellcheck/source/sourceProseClient';
import { spellMarkupOf, splitParagraphs } from '$lib/editor/spellcheck/source/sourceProse';
import { lintParagraphs, paragraphLints } from '$lib/editor/spellcheck/source/paragraphLints';
import { spellingFor } from '$lib/editor/spellcheck/languages/spellingLanguage.svelte';
import { overlapsMask } from '$lib/editor/spellcheck/texMask';
import { reviewedMatches } from '$lib/editor/spellcheck/review/reviewStore';
import { sourceReading } from '$lib/editor/spellcheck/review/sourceReading';
import { SPELLING_RULE } from '$lib/editor/spellcheck/config/grammarRules';
import { m } from '$lib/paraglide/messages';
import { replaceFix } from '../problemFixes';
import { ignoreKeyOf } from '../ignoredProblems';
import { lineAt, lineText, linesOf } from '../textLines';
import type { Problem, ProblemFilter } from '../problemTypes';

const SLICE_MS = 25;
const SPELLING_KINDS = new Set(['Spelling', 'Typo']);
const STYLE_KINDS = new Set(['Style', 'Readability', 'Enhancement']);

function filterOf(rule: string | undefined, kind: string): ProblemFilter {
	if (rule === SPELLING_RULE || SPELLING_KINDS.has(kind)) return 'spelling';
	return STYLE_KINDS.has(kind) ? 'style' : 'grammar';
}

/** what Ignore remembers a spelling or grammar row by, for the source editor to leave it unmarked too */
export function proofreadIgnoreKey(path: string, rule: string, kind: string, words: string, line: string): string {
	return ignoreKeyOf(filterOf(rule, kind), path, rule, words, line);
}

/** null when the file is not prose Texpile checks, or when the check stopped or failed */
export async function proofreadProblems(path: string, text: string, isStale: () => boolean): Promise<Problem[] | null> {
	const markup = spellMarkupOf(path);
	if (!markup) return null;
	const spelling = spellingFor(path, text).language;
	if (!spelling) return [];
	const prose = await sourceProseInWorker(text, markup, spelling);
	if (!prose || isStale()) return null;
	const paras = splitParagraphs(prose.text);
	if (!(await lintParagraphs(paras, spelling, markup, isStale))) return null;
	const lines = linesOf(text);
	const out: Problem[] = [];
	let sliceEnd = performance.now() + SLICE_MS;
	for (const p of paras) {
		if (performance.now() > sliceEnd) {
			await new Promise((next) => setTimeout(next));
			if (isStale()) return null;
			sliceEnd = performance.now() + SLICE_MS;
		}
		const matches = paragraphLints(spelling, markup, p.text);
		if (!matches) continue;
		const target = { language: spelling, linted: p.text, matches, reading: () => sourceReading(text, p.from, p.text, prose.spans) };
		for (const match of reviewedMatches(target)) {
			const from = p.from + match.offset;
			const to = from + match.length;
			if (to <= from || to > text.length || overlapsMask(prose.spans, from, to)) continue;
			const words = text.slice(from, to);
			const filter = filterOf(match.rule, match.type.typeName);
			const line = lineAt(lines, from);
			const replacement = match.replacements?.[0];
			out.push({
				filter,
				file: path,
				line,
				message: match.message,
				words,
				fix:
					replacement === undefined
						? undefined
						: replaceFix(
								path,
								from,
								words,
								replacement,
								replacement === '' ? m.problems_fix_remove({ words }) : m.problems_fix_change({ text: replacement })
							),
				ignoreKey: proofreadIgnoreKey(path, match.rule, match.type.typeName, words, lineText(lines, line))
			});
		}
	}
	return out;
}
