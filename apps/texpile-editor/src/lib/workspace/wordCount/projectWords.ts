// the word count of a whole document: its main file and every file it brings in
import { addTally, latexCount, NO_WORDS, typstCount, type FileCount, type WordTally } from './proseWords';
import { documentFiles, type Read } from '$lib/workspace/document/documentFiles';
import { samePath } from '$lib/workspace/fileSystem';

export type FileWords = FileCount & {
	path: string;
	/** named by an include but not found */
	missing?: true;
};

export type ProjectWords = { files: FileWords[]; total: WordTally; characters: number };

/** `read` gives the open file's text from its editor, so unsaved edits count, and throws for a missing file */
export async function countProjectWords(main: string, root: string, read: Read): Promise<ProjectWords> {
	const files: FileWords[] = (await documentFiles(main, root, read)).map((f) =>
		f.missing
			? { path: f.path, words: NO_WORDS, characters: 0, missing: true }
			: { path: f.path, ...(/\.typ$/i.test(f.path) ? typstCount(f.text) : latexCount(f.text, samePath(f.path, main))) }
	);
	return {
		files,
		total: files.reduce((t, f) => addTally(t, f.words), NO_WORDS),
		characters: files.reduce((n, f) => n + f.characters, 0)
	};
}

/** whether the count read `path` */
export function counts(result: ProjectWords, path: string): boolean {
	return result.files.some((f) => !f.missing && samePath(f.path, path));
}
