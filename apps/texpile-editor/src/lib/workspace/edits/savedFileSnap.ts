// the visual editor shows what the file holds: a save that reads back otherwise takes the file's reading
import type { EditorView as PMEditorView } from 'prosemirror-view';
import { applyRemotePatch } from '$lib/collab/remotePatch';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';

/** false when the editor moved on while the file was parsed: the next save checks again */
export async function snapToSavedFile(
	view: PMEditorView | null,
	doc: DocumentBuffer,
	parse: (text: string) => Promise<ParsedLatexFile | null>,
	text: string
): Promise<boolean> {
	const shown = doc.lastDoc;
	const parsed = await parse(text);
	if (!parsed || !view || view.isDestroyed || doc.texSource !== text || doc.lastDoc !== shown || view.state.doc !== shown) return false;
	applyRemotePatch(view, parsed.doc, doc.sourceMap, parsed.map, parsed.origins, text, text);
	doc.adoptPatched(parsed, view.state.doc, text);
	return true;
}
