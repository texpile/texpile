import { footnoteFace, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { readFootnote } from './footnoteCall';
import { noteFootnoteFace } from './noteFootnote';
import TypstFootnoteSettings from './TypstFootnoteSettings.svelte';
import { footnoteDocument } from './document';

// a note of its own steps the counter, in a content block or an argument; #footnote(<label>) repeats another's number
const NOTES = new Set(['ContentBlock', 'Str', 'Ident', 'FieldAccess', 'FuncCall']);

export const footnote: TypstPlugin = {
	functions: ['footnote'],
	counts: { footnote: (call) => call.args.filter((kind) => NOTES.has(kind)).map(() => null) },
	face(core) {
		const read = readFootnote(core.source);
		return read ? footnoteFace(0, null, read.note) : noteFootnoteFace(core.source);
	},
	settings: (source) => (readFootnote(source) ? TypstFootnoteSettings : null),
	document: footnoteDocument
};
