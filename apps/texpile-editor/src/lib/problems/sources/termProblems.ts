// terms written two ways as Style rows, each with the way most of the document writes it as its fix
import { m } from '$lib/paraglide/messages';
import { replaceFix } from '../problemFixes';
import { ignoreKeyOf } from '../ignoredProblems';
import { lineAt, lineText, linesOf, type TextLines } from '../textLines';
import { termVariants, type ProseFile, type TermVariant } from '../checks/termVariants';
import { sourceProseInWorker } from '$lib/editor/spellcheck/source/sourceProseClient';
import { spellMarkupOf } from '$lib/editor/spellcheck/source/sourceProse';
import { spellingFor } from '$lib/editor/spellcheck/languages/spellingLanguage.svelte';
import type { Problem } from '../problemTypes';

function termProblems(variants: TermVariant[], texts: ReadonlyMap<string, string>): Problem[] {
	const lines = new Map<string, TextLines>();
	return variants.map((v): Problem => {
		let starts = lines.get(v.file);
		if (!starts) lines.set(v.file, (starts = linesOf(texts.get(v.file) ?? '')));
		const line = lineAt(starts, v.at);
		return {
			filter: 'style',
			file: v.file,
			line,
			message: m.problems_term_two_ways({ used: v.words, other: v.preferred }),
			words: v.words,
			fix: replaceFix(v.file, v.at, v.words, v.preferred, m.problems_fix_change({ text: v.preferred })),
			ignoreKey: ignoreKeyOf('style', v.file, 'two-ways', v.words, lineText(starts, line))
		};
	});
}

/** English LaTeX and Markdown only; null when stopped */
export async function documentTermProblems(
	paths: string[],
	texts: ReadonlyMap<string, string>,
	isStale: () => boolean
): Promise<Problem[] | null> {
	const files: ProseFile[] = [];
	for (const path of paths) {
		const text = texts.get(path);
		const markup = spellMarkupOf(path);
		if (text === undefined || (markup !== 'plaintext' && markup !== 'markdown') || spellingFor(path, text).language !== 'en') continue;
		const prose = await sourceProseInWorker(text, markup, 'en');
		if (isStale()) return null;
		if (prose) files.push({ path, prose: prose.text });
	}
	return termProblems(termVariants(files), texts);
}
