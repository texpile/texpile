// the reader's selection as an exact span of the open file's text, in either mode, for Refine and the Agent tab
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { sourceAnchorFor } from '$lib/editor/visual/extensions/pmComments';
import { hasVisualMode, type DocumentBuffer, type FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import type { WorkspaceComments } from './workspaceComments.svelte';

export type SpanDeps = {
	comments: WorkspaceComments;
	doc: DocumentBuffer;
	modes: ViewModeSwitch;
	kind: () => FileKind;
};

/** the span and the whole text it is a span of; null with nothing selected, or a selection that maps to no exact span */
export function selectedSpan(d: SpanDeps): { text: string; from: number; to: number } | null {
	const text = d.comments.activeText();
	if (d.modes.mode === 'visual' && hasVisualMode(d.kind())) {
		const view = editorViewStore.current;
		const s = view?.state.selection;
		if (!view || !s || s.empty || text !== d.doc.texSource) return null;
		// exact at both ends or nothing: a span guessed wider would rewrite more than the reader chose
		const anchor = sourceAnchorFor(view.state.doc, d.doc.sourceMap, text, s.from, s.to);
		return anchor && anchor.end > anchor.start ? { text, from: anchor.start, to: anchor.end } : null;
	}
	const cm = sourceCmView.current;
	if (!cm || cm.state.doc.length !== text.length) return null;
	const { from, to } = cm.state.selection.main;
	return to > from ? { text, from, to } : null;
}
