// The top of each thread's highlight, in the margin's own coordinates, for the two editors.
import type { EditorView as CodeMirrorView } from '@codemirror/view';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';
import type { CommentRange } from '$lib/editor/visual/extensions/comments';

export const PENDING_ANCHOR = 'pending';

export function measurePmAnchors(view: ProseMirrorView, rail: HTMLElement, pendingWanted: boolean): Map<string, number> {
	const root = view.dom as HTMLElement;
	const top = rail.getBoundingClientRect().top;
	const out = new Map<string, number>();
	for (const el of root.querySelectorAll<HTMLElement>('.pm-comment[data-comment]')) {
		const id = el.dataset.comment;
		if (!id || out.has(id)) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		out.set(id, Math.round(rect.top - top));
	}
	const pending = root.querySelector<HTMLElement>('.pm-comment-pending');
	if (pending) out.set(PENDING_ANCHOR, Math.round(pending.getBoundingClientRect().top - top));
	else if (pendingWanted) {
		const at = caretCoords(view);
		if (at) out.set(PENDING_ANCHOR, Math.round(at.top - top));
	}
	return out;
}

function caretCoords(view: ProseMirrorView): { top: number } | null {
	try {
		return view.coordsAtPos(view.state.selection.from);
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
	rail: HTMLElement
): Map<string, number> {
	const top = rail.getBoundingClientRect().top;
	const len = view.state.doc.length;
	const out = new Map<string, number>();
	for (const r of ranges) {
		if (r.resolved || r.to === r.from || out.has(r.id)) continue;
		const c = view.coordsAtPos(Math.min(r.from, len));
		if (c) out.set(r.id, Math.round(c.top - top));
	}
	if (pending?.from !== undefined) {
		const c = view.coordsAtPos(Math.min(pending.from, len));
		if (c) out.set(PENDING_ANCHOR, Math.round(c.top - top));
	}
	return out;
}
