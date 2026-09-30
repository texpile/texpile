// Copy-side clipboard bridge for the markdown editor: the third dialect alongside latexClipboard
// and the typst visual editor's clipboard.ts. Copy puts real markdown on the clipboard so pasting
// into source mode, a terminal, or another editor yields working markup; PM's own HTML format
// rides alongside, so visual->visual paste is untouched. The paste half is editor/paste's
// visualSmartPaste, shared with the other editors.
import { Plugin } from 'prosemirror-state';
import { Slice, Fragment } from 'prosemirror-model';
import { mdSchema } from './schema';
import { serializeToMarkdown } from './serializer';

/** serialize a clipboard slice to Markdown. Inline slices (a selection inside one paragraph) wrap
 *  in a paragraph first; block slices serialize as they are, open ends included (a partially
 *  selected paragraph is still a paragraph node, and its shortened content no longer matches the
 *  block's parse-time norm, so blockAssembly regenerates it instead of re-emitting the whole
 *  original source slice). */
export function sliceToMarkdown(slice: Slice): string {
	let frag = slice.content;
	if (frag.childCount === 0) return '';
	if (frag.firstChild!.isInline) frag = Fragment.from(mdSchema.nodes.paragraph.create(null, frag));
	// block handlers each end with their own '\n\n' separation; that is document assembly, not
	// content, so it comes off the clipboard
	return serializeToMarkdown(mdSchema.topNodeType.create(null, frag)).replace(/\n+$/, '');
}

export const markdownCopyPlugin = new Plugin({
	props: {
		clipboardTextSerializer(slice) {
			try {
				return sliceToMarkdown(slice);
			} catch {
				// never break copy over a serializer edge case; PM's plain text is the floor
				return slice.content.textBetween(0, slice.content.size, '\n\n');
			}
		}
	}
});
