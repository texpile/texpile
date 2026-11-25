// what the open file shows on its own: its notes, and its spelling and grammar while the spell check is on
import { editorConfigStore } from '$lib/stores/editorStore';
import { latexTreeInSlices } from '$lib/languages/latex/syntax/latexTrees';
import { fileNotes } from '../checks/fileNotes';
import { noteProblems } from './noteProblems';
import { proofreadProblems } from './proofreadProblems';
import type { Problem } from '../problemTypes';

export async function openFileRows(path: string, text: string, isStale: () => boolean): Promise<Problem[] | null> {
	let notes: Problem[] = [];
	if (path.toLowerCase().endsWith('.tex')) {
		await latexTreeInSlices(text);
		if (isStale()) return null;
		notes = noteProblems(path, text, fileNotes(text));
	}
	if (!(editorConfigStore.current?.spellcheck ?? false)) return notes;
	const proofread = await proofreadProblems(path, text, isStale);
	if (isStale()) return null;
	return [...notes, ...(proofread ?? [])];
}
