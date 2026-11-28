// notes left in a LaTeX file: TODO comments and review commands such as \todo and \hl
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { noteMarkersIn } from '$lib/editor/source/extensions/note-marks/noteMarkers';

// todonotes, soul, fixme
const NOTE_COMMANDS = new Set(['\\todo', '\\hl', '\\missingfigure', '\\fixme', '\\fxnote', '\\fxwarning', '\\fxerror', '\\fxfatal']);
const SHOWN_TEXT = 100;

/** text: the comment from its marker on, or the command */
export type FileNote = { at: number; words: string; text: string; command: boolean };

export function fileNotes(text: string): FileNote[] {
	const out: FileNote[] = [];
	latexTreeOf(text).iterate({
		enter(n) {
			if (n.name === 'VerbatimEnvironment' || n.name === 'Verb') return false;
			if (n.name === 'Comment') {
				const comment = text.slice(n.from, n.to);
				const first = noteMarkersIn(comment)[0];
				if (first)
					out.push({ at: n.from + first.at, words: first.word, text: comment.slice(first.at).trim().slice(0, SHOWN_TEXT), command: false });
			} else if (n.name === 'ControlWord') {
				const name = text.slice(n.from, n.to);
				if (NOTE_COMMANDS.has(name)) out.push({ at: n.from, words: name, text: name, command: true });
			}
			return undefined;
		}
	});
	return out;
}
