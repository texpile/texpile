import { latexTreeInSlices } from '$lib/languages/latex/syntax/latexTrees';
import { codeOnly } from '$lib/languages/latex/texCode';

/** the trees the readers of a file's source ask for: the file's own, and the one of its code alone that most of them read */
export async function readSourceTrees(text: string): Promise<void> {
	await latexTreeInSlices(text);
	await new Promise((next) => setTimeout(next));
	await latexTreeInSlices(codeOnly(text));
}
