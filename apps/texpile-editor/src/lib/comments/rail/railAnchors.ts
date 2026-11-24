// The top of each thread's highlight, in the margin's own coordinates, for the two editors.
import type { EditorView as CodeMirrorView } from '@codemirror/view';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';
import type { CommentRange } from '$lib/editor/visual/extensions/comments';
import { pmCommentsKey } from '$lib/editor/visual/extensions/pmComments';
import { pmSuggestionsKey } from '$lib/editor/visual/extensions/pmSuggestionsState';
import type { SuggestionRange } from '$lib/editor/source/cmSuggestions';

export const PENDING_ANCHOR = 'pending';

/** each thread's first place in the document, as its first highlighted piece stood */
export function measurePmAnchors(view: ProseMirrorView, rail: HTMLElement, pendingWanted: boolean): Map<string, number> {
	const top = rail.getBoundingClientRect().top;
	const { state } = view;
	const comments = pmCommentsKey.getState(state);
	const size = state.doc.content.size;
	const starts: { id: string; from: number }[] = [
		...(comments?.ranges ?? []).filter((r) => !r.resolved && r.to > r.from && r.to <= size),
		...(pmSuggestionsKey.getState(state)?.ranges ?? [])
	].sort((a, b) => a.from - b.from);
	const out = new Map<string, number>();
	for (const { id, from } of starts) if (!out.has(id)) out.set(id, Math.round(view.canvas.rangeTop(from).top - top));
	// the composer by the selected text's own top, a posted thread by its line's, as the DOM editor placed them
	const at = pendingWanted || comments?.pending ? caretCoords(view, comments?.pending?.from ?? view.state.selection.from) : null;
	if (at) out.set(PENDING_ANCHOR, Math.round(at.top - top));
	return out;
}

function caretCoords(view: ProseMirrorView, pos: number): { top: number } | null {
	try {
		return view.coordsAtPos(pos);
	} catch {
		return null;
	}
}

export function cmTextExtent(view: CodeMirrorView): { box: number; text: number } {
	const left = view.contentDOM.getBoundingClientRect().left;
	let text = 0;
	const range = document.createRange();
	for (const line of view.contentDOM.querySelectorAll('.cm-line')) {
		range.selectNodeContents(line);
		const r = range.getBoundingClientRect();
		if (r.width > 0) text = Math.max(text, r.right - left);
	}
	return { box: view.contentDOM.getBoundingClientRect().width, text };
}

export function measureCmAnchors(
	view: CodeMirrorView,
	ranges: CommentRange[],
	pending: { from?: number } | null,
	rail: HTMLElement,
	suggestions: SuggestionRange[] = []
): Map<string, number> {
	const top = rail.getBoundingClientRect().top;
	const len = view.state.doc.length;
	const out = new Map<string, number>();
	for (const r of ranges) {
		if (r.resolved || r.to === r.from || out.has(r.id)) continue;
		const c = view.coordsAtPos(Math.min(r.from, len));
		if (c) out.set(r.id, Math.round(c.top - top));
	}
	for (const r of suggestions) {
		if (out.has(r.id)) continue;
		const c = view.coordsAtPos(Math.min(r.from, len));
		if (c) out.set(r.id, Math.round(c.top - top));
	}
	if (pending?.from !== undefined) {
		const c = view.coordsAtPos(Math.min(pending.from, len));
		if (c) out.set(PENDING_ANCHOR, Math.round(c.top - top));
	}
	return out;
}
