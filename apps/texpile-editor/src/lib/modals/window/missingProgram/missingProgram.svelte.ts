// A program a typesetter needs that Texpile could not find: which one, for the dialog that says how to get it, asked for
// at the moment something needed it rather than up front. And whether Typst's is known missing in this window, for the
// places that would otherwise wait on it in silence: the preview pane and the bar over a .typ file
import { box } from '$lib/runes/box.svelte';

export type ProgramFamily = 'latex' | 'typst';

// what Preferences › Toolchain checks for, so the dialog can say whether each is there now
const LATEX = ['latexmk', 'pdflatex', 'lualatex', 'xelatex', 'biber', 'bibtex', 'latexindent', 'synctex'];

export function familyOf(program: string): ProgramFamily | null {
	if (program === 'tinymist') return 'typst';
	return LATEX.includes(program) ? 'latex' : null;
}

/** the program the dialog is about; null while it is closed */
export const askedProgram = box<string | null>(null);

/** tinymist known missing: set where a start or a look found none, cleared where one is found. The preview waits on it */
export const tinymistMissing = box(false);

/** the dialog for a typesetter's program; false for any other, which the caller says is missing its own way */
export function askForProgram(program: string): boolean {
	if (!familyOf(program)) return false;
	if (program === 'tinymist') tinymistMissing.current = true;
	askedProgram.current = program;
	return true;
}
