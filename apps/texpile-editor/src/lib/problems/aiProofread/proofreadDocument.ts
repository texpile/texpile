// Proofread document with AI: every paragraph of the main document, or of the open file with no main file set
import { indexedText } from '$lib/files/index/indexedTexts';
import { mainFile } from '$lib/workspace/workspaceStore';
import { sourceProseInWorker } from '$lib/editor/spellcheck/source/sourceProseClient';
import { spellMarkupOf, splitParagraphs } from '$lib/editor/spellcheck/source/sourceProse';
import { lintParagraphs, paragraphLints } from '$lib/editor/spellcheck/source/paragraphLints';
import { spellingFor } from '$lib/editor/spellcheck/languages/spellingLanguage.svelte';
import { sourceReading } from '$lib/editor/spellcheck/review/sourceReading';
import { reviewParagraphs } from '$lib/editor/spellcheck/review/reviewQueue';
import type { ReviewTarget } from '$lib/editor/spellcheck/review/reviewTypes';
import { mainDocument } from '../sources/mainDocument.svelte';
import { problemsOpenFile } from '../problemsStore.svelte';

async function targetsIn(path: string): Promise<ReviewTarget[]> {
	const markup = spellMarkupOf(path);
	const text = markup && (await indexedText(path).catch(() => null));
	if (!markup || text == null) return [];
	const spelling = spellingFor(path, text).language;
	const prose = spelling && (await sourceProseInWorker(text, markup, spelling));
	if (!spelling || !prose) return [];
	const paras = splitParagraphs(prose.text);
	if (!(await lintParagraphs(paras, spelling, markup, () => false))) return [];
	return paras.flatMap((p) => {
		const matches = paragraphLints(spelling, markup, p.text);
		return matches
			? [{ language: spelling, linted: p.text, matches, reading: () => sourceReading(text, p.from, p.text, prose.spans) }]
			: [];
	});
}

/** the number of paragraphs that go to the model */
export async function proofreadDocument(): Promise<number> {
	const doc = mainFile.current ? mainDocument.current : null;
	const open = problemsOpenFile.current;
	const paths = doc ? doc.files : open ? [open] : [];
	const targets: ReviewTarget[] = [];
	for (const path of paths) targets.push(...(await targetsIn(path)));
	return reviewParagraphs(targets);
}

export function documentProofreadOffered(): boolean {
	return !!(mainFile.current ? mainDocument.current : problemsOpenFile.current);
}
