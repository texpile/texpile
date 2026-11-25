// a file's notes as Style rows
import { m } from '$lib/paraglide/messages';
import { ignoreKeyOf } from '../ignoredProblems';
import { lineAt, lineText, linesOf } from '../textLines';
import type { FileNote } from '../checks/fileNotes';
import type { Problem } from '../problemTypes';

export function noteProblems(path: string, text: string, notes: FileNote[]): Problem[] {
	if (!notes.length) return [];
	const lines = linesOf(text);
	return notes.map((n): Problem => {
		const line = lineAt(lines, n.at);
		return {
			filter: 'style',
			file: path,
			line,
			message: n.command ? m.problems_note_command({ command: n.text }) : n.text,
			words: n.words,
			ignoreKey: ignoreKeyOf('style', path, 'note', n.words, lineText(lines, line))
		};
	});
}
