// The clipboard bridge between the visual editor and LaTeX text. Copy puts real LaTeX on the
// clipboard (so pasting into source mode, a terminal, or another editor yields working markup);
// paste detects LaTeX-looking text and parses it into rich nodes instead of literal backslash
// soup. PM's own HTML clipboard format rides alongside, so internal visual->visual paste is
// untouched. These fragment converters are also the primitives block-scoped re-parse will reuse.

import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Slice, Fragment } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { regenerateCopiedLabels } from './paste-uuid-fix';
import { pasteReadingOfText } from '$lib/editor/paste/pasteReadingOfText';

/** serialize a clipboard slice to LaTeX. Inline slices (a selection inside one paragraph) wrap
 *  in a paragraph first; block slices serialize as they are, open ends included (a partially
 *  selected paragraph is still a paragraph node, which serializes as correct LaTeX). */
export function sliceToLatex(slice: Slice): string {
	let frag = slice.content;
	if (frag.childCount === 0) return '';
	if (frag.firstChild!.isInline) frag = Fragment.from(schema.nodes.paragraph.create(null, frag));
	// a trailing \par is paragraph-separator noise on a clipboard, not content
	return serializeToLatex(schema.topNodeType.create(null, frag)).replace(/\s*\\par\s*$/, '');
}

/** conservative gate: pasted prose containing one stray backslash must stay plain text. */
export function looksLikeLatex(text: string): boolean {
	if (/\\begin\{[a-zA-Z*]+\}/.test(text)) return true;
	// a command's backslash follows start/whitespace/punctuation, never a path segment (C:\Users\lee)
	if (/(?<=^|[^a-zA-Z0-9:.\\])\\[a-zA-Z]+\{/.test(text)) return true;
	if (/\$[^$\n]+\$|\\\[|\\\(/.test(text)) return true;
	return (text.match(/(?<=^|[^a-zA-Z0-9:.\\])\\[a-zA-Z]{2,}/g)?.length ?? 0) >= 2;
}

/** parse a LaTeX snippet into top-level nodes; null means "insert as plain text instead".
 *  Unknown constructs come back as raw chips, which is the importer's normal fidelity behavior
 *  and strictly better than escaped-backslash text. */
export function parseLatexFragment(text: string): Fragment | null {
	try {
		const { doc } = latexToProseMirror(text);
		return doc.childCount === 0 ? null : doc.content;
	} catch {
		return null;
	}
}

/** parse LaTeX-looking text and insert it as rich nodes; false = not LaTeX, caller inserts it as
 *  plain text */
export function pasteLatexText(view: EditorView, text: string): boolean {
	if (!text || !looksLikeLatex(text)) return false;
	const slice = latexSourceSlice(text);
	if (!slice) return false;
	pasteReadingOfText(view, text, regenerateCopiedLabels(slice));
	return true;
}

/** LaTeX as the editor takes it in: a single paragraph open, so it merges into the one at the caret */
export function latexSourceSlice(text: string): Slice | null {
	const frag = parseLatexFragment(text);
	if (!frag) return null;
	const open = frag.childCount === 1 && frag.firstChild!.type.name === 'paragraph' ? 1 : 0;
	return new Slice(frag, open, open);
}

export const latexClipboardPlugin = new Plugin({
	props: {
		clipboardTextSerializer(slice) {
			try {
				return sliceToLatex(slice);
			} catch {
				// never break copy over a serializer edge case; PM's plain text is the floor
				return slice.content.textBetween(0, slice.content.size, '\n\n');
			}
		},
		handlePaste(view, event) {
			const cd = event.clipboardData;
			if (!cd) return false;
			// text/html present = PM's own copy (internal paste) or a rich source; let PM parse it
			if (cd.getData('text/html')) return false;
			return pasteLatexText(view, cd.getData('text/plain'));
		}
	}
});
