// a footnote whose note is an argument, drawn as the footnote mark
import { footnoteFace, type ChipFace } from '$lib/languages/typst/visual/core';
import { readNoteFootnote } from './noteCall';

export function noteFootnoteFace(source: string): ChipFace | null {
	const note = readNoteFootnote(source);
	return note === null ? null : footnoteFace(0, null, note);
}
