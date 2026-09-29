// a source edit applied to the mounted visual editor as one undoable step
import type { EditorView as PMEditorView } from 'prosemirror-view';
import { computeBlockPatch, syncParseAttrs } from '$lib/editor/visual/blockPatch';
import { adoptParse } from '$lib/editor/visual/parseOrigins';
import { parseCarryKey } from '$lib/editor/visual/parseCarry';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { TextEdit } from '$lib/workspace/edits/textEdits';

// words the editor holds as written: nothing the serializer would escape or read as markup
const PLAIN = /^[^\\{}$%&#^_~\r\n]*$/;

/** the edits typed in, so comments and suggestions follow each one; false, changing nothing, outside plain text */
export function editVisualText(view: PMEditorView, doc: DocumentBuffer, before: string, next: string, edits: readonly TextEdit[]): boolean {
	if (view.isDestroyed || doc.texSource !== before) return false;
	const tr = view.state.tr;
	for (const e of [...edits].reverse()) {
		if (!PLAIN.test(e.insert) || !PLAIN.test(before.slice(e.from, e.to))) return false;
		const run = doc.sourceMap.leaves.find((s) => s.kind === 'text' && s.srcFrom <= e.from && e.to <= s.srcTo);
		if (!run) return false;
		tr.insertText(e.insert, run.pmFrom + (e.from - run.srcFrom), run.pmFrom + (e.to - run.srcFrom));
	}
	if (!tr.docChanged || doc.textOf(view.state.apply(tr).doc) !== next) return false;
	view.dispatch(tr);
	return true;
}

export async function patchVisualFromSource(
	view: PMEditorView,
	doc: DocumentBuffer,
	parse: (text: string) => Promise<ParsedLatexFile | null>,
	before: string,
	next: string
): Promise<boolean> {
	const parsed = await parse(next);
	if (!parsed || view.isDestroyed || doc.texSource !== before) return false;
	if (parsed.preamble !== doc.docMeta?.preamble || parsed.postamble !== doc.docMeta?.postamble) {
		doc.replaceSource(next, { dirty: true });
		return true;
	}
	const patch = computeBlockPatch(view.state.doc, parsed.doc);
	const tr = view.state.tr;
	if (patch) tr.replaceWith(patch.from, patch.to, patch.nodes);
	syncParseAttrs(tr, parsed.doc);
	// the new document is the parse's as it is written out in this dispatch, not only after it
	tr.setMeta(parseCarryKey, parsed.origins);
	if (tr.steps.length) view.dispatch(tr);
	// the patched document is the parse's from here on, even one the patch left as it was: the
	// same content may now come from other bytes (a restored "..." the parser reads as its
	// ellipsis), so a document with no step to dispatch is written out here, the way a dispatch
	// would have it written, and the text takes those bytes
	adoptParse(view.state.doc, parsed.origins);
	if (!tr.steps.length) doc.onVisualChange(view.state.doc);
	return true;
}
