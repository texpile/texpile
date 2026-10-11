import { nativeBridge, readTextFile, writeTextFile } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { ensureProjectSnippets, reloadSnippets } from '../file/snippetLoader';
import { convertLatexSuite, type SuiteConversion } from './latexSuite';
import { insertSnippetEntries } from './insertSnippetEntries';

/** picks a LaTeX Suite snippets file and adds what carries over to the folder's snippets */
export async function importLatexSuite(root: string, openFile: (path: string) => void): Promise<void> {
	const picked = await nativeBridge()?.pickFile?.(m.import_latex_suite_pick());
	if (!picked) return;
	let conversion: SuiteConversion;
	try {
		conversion = convertLatexSuite(await readTextFile(picked));
	} catch (e) {
		toaster.error({ title: m.import_latex_suite_failed(), description: (e as Error).message });
		return;
	}
	const { entries, skipped } = conversion;
	const first = skipped[0];
	const why = first ? m.import_latex_suite_skipped({ count: skipped.length, first: `"${first.name}" ${first.reason}` }) : undefined;
	if (!entries.length) {
		toaster.info({ title: m.import_latex_suite_none(), description: why });
		return;
	}
	const path = await ensureProjectSnippets(root);
	if (!path) return;
	await writeTextFile(path, insertSnippetEntries(await readTextFile(path), entries));
	await reloadSnippets(root);
	openFile(path);
	toaster.success({ title: m.import_latex_suite_done({ count: entries.length }), description: why });
}
