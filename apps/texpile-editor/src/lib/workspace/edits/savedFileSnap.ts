// the visual editor shows what the file holds: a save that reads back otherwise takes the file's reading
import type { EditorView as PMEditorView } from 'prosemirror-view';
import { applyRemotePatch } from '$lib/collab/remotePatch';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';

/** LaTeX source the writer is still typing reads as something else until it is whole: `\begin{figure}` with its
 *  `\end` to come reads as a raw line, a paragraph and a picture */
function caretInSource(view: PMEditorView): boolean {
	const { $from } = view.state.selection;
	for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type.spec.code) return true;
	return false;
}

/** false when the editor moved on while the file was parsed: the next save checks again */
export async function snapToSavedFile(
	view: PMEditorView | null,
	doc: DocumentBuffer,
	parse: (text: string) => Promise<ParsedLatexFile | null>,
	text: string
): Promise<boolean> {
	// taken now, the half typed block is split under the caret and the lines typed next land before its picture
	if (view && !view.isDestroyed && caretInSource(view)) {
		view.dom.addEventListener('focusout', () => setTimeout(() => void snapToSavedFile(view, doc, parse, text)), { once: true });
		return false;
	}
	const shown = doc.lastDoc;
	const parsed = await parse(text);
	if (!parsed || !view || view.isDestroyed || doc.texSource !== text || doc.lastDoc !== shown || view.state.doc !== shown) return false;
	applyRemotePatch(view, parsed.doc, doc.sourceMap, parsed.map, parsed.origins, text, text);
	doc.adoptPatched(parsed, view.state.doc, text);
	return true;
}
