import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readFootnote } from './footnoteCall';
import { readNoteFootnote } from './noteCall';

export const footnoteDocument: TypstDocumentPlugin = {
	import: { chips: (source) => readFootnote(source) !== null || readNoteFootnote(source.trim()) !== null }
};
