// a change to the open file made in its editor, not on disk: undoable, and a suggestion in suggestion mode
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { hasVisualMode, type DocumentBuffer, type FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { SourceEdit } from '$lib/workspace/suggestionsController';
import { patchVisualFromSource } from '$lib/workspace/edits/visualSourcePatch';
import type { OpenTexFile } from '$lib/languages/latex/symbols/latexSymbolPackage';

export type OpenEditorDeps = {
	doc: DocumentBuffer;
	mode: () => 'visual' | 'source';
	kind: () => FileKind;
	parseVisual: (text: string) => Promise<ParsedLatexFile | null>;
};

/** `edit` positions are in `before`; false when no editor shows the file or it no longer holds `before` */
export async function editOpenFile(
	d: OpenEditorDeps,
	before: string,
	next: string,
	edit?: SourceEdit | readonly SourceEdit[]
): Promise<boolean> {
	if (d.mode() === 'visual' && hasVisualMode(d.kind())) {
		const v = editorViewStore.current;
		return !!v && patchVisualFromSource(v, d.doc, d.parseVisual, before, next);
	}
	const cm = sourceCmView.current;
	if (!cm || cm.state.doc.toString() !== before) return false;
	cm.dispatch({ changes: edit ? [edit].flat() : changedSpan(before, next) });
	return true;
}

/** the open file for code outside the workspace that edits it whole (the LaTeX symbol picker's \usepackage) */
export function openTexFileOf(d: OpenEditorDeps): OpenTexFile {
	return {
		path: () => d.doc.path,
		text: () => (d.kind() === 'tex' ? d.doc.texSource : null),
		edit: (before, next) => editOpenFile(d, before, next)
	};
}

/** the one range that turns `before` into `next`: all but their shared start and end */
export function changedSpan(before: string, next: string): SourceEdit {
	let start = 0;
	const max = Math.min(before.length, next.length);
	while (start < max && before[start] === next[start]) start++;
	let end = 0;
	while (end < max - start && before[before.length - 1 - end] === next[next.length - 1 - end]) end++;
	return { from: start, to: before.length - end, insert: next.slice(start, next.length - end) };
}
