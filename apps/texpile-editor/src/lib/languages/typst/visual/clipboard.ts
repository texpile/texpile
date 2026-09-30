// Copy-side clipboard bridge for the typst visual editor: the counterpart of latexClipboard's
// clipboardTextSerializer (the paste side lives in TypstEditorView's pasteTypstPlugin). Copy puts
// real typst on the clipboard so pasting into source mode, a terminal, or another editor yields
// working markup; PM's own HTML format rides alongside, so visual->visual paste is untouched.
import { Plugin } from 'prosemirror-state';
import { Slice, Fragment } from 'prosemirror-model';
import { typSchema } from './schema';
import { serializeToTypst } from './serialize/serializer';

/** serialize a clipboard slice to Typst. Inline slices (a selection inside one paragraph) wrap
 *  in a paragraph first; block slices serialize as they are - a partially selected block fails
 *  the parse's origins and regenerates, so stale bytes never leak. */
export function sliceToTypst(slice: Slice): string {
	let frag = slice.content;
	if (frag.childCount === 0) return '';
	if (frag.firstChild!.isInline) frag = Fragment.from(typSchema.nodes.paragraph.create(null, frag));
	return serializeToTypst(typSchema.topNodeType.create(null, frag)).replace(/\n+$/, '');
}

export const typstCopyPlugin = new Plugin({
	props: {
		clipboardTextSerializer(slice) {
			try {
				return sliceToTypst(slice);
			} catch {
				// never break copy over a serializer edge case; PM's plain text is the floor
				return slice.content.textBetween(0, slice.content.size, '\n\n');
			}
		}
	}
});
