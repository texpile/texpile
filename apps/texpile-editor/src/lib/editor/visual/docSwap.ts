import { EditorState, TextSelection } from 'prosemirror-state';
import { fixTables } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import type { Node as PmNode, Schema } from 'prosemirror-model';

function scrollParent(el: HTMLElement | null): HTMLElement | null {
	let cur = el?.parentElement ?? null;
	while (cur) {
		const oy = getComputedStyle(cur).overflowY;
		if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
		cur = cur.parentElement;
	}
	return null;
}

function stateForDoc(editorView: EditorView, schema: Schema, next: PmNode): EditorState {
	const base = EditorState.create({ schema, plugins: editorView.state.plugins, doc: next });
	const fix = fixTables(base);
	return fix ? base.apply(fix.setMeta('addToHistory', false)) : base;
}

export function swapParsedDoc(editorView: EditorView, schema: Schema, next: PmNode): void {
	// a bare updateState resets the selection to doc start and the focused editor scrolls to it,
	// so carry the caret offset (clamped) and scroll position across the swap
	const scroller = scrollParent(editorView.dom);
	const savedTop = scroller?.scrollTop ?? 0;
	const prevAnchor = editorView.state.selection.anchor;

	const base = stateForDoc(editorView, schema, next);
	let restored = base;
	try {
		const pos = Math.min(Math.max(1, prevAnchor), base.doc.content.size);
		restored = base.apply(base.tr.setSelection(TextSelection.near(base.doc.resolve(pos))).setMeta('addToHistory', false));
	} catch {
		// structural change, position didn't map, fall back to default selection
	}
	editorView.updateState(restored);

	if (scroller) {
		scroller.scrollTop = savedTop; // undo any synchronous caret-scroll from the state swap
		// single rAF by contract: WorkspaceView's mode-switch scroll anchor uses a double rAF to
		// land after this restore, so bumping this to a double rAF would stomp the anchor
		requestAnimationFrame(() => (scroller.scrollTop = savedTop)); // and any post-layout scrollIntoView
	}
}

/** carries nothing across: the caller restores this file's own caret and scroll */
export function swapDocForNewFile(editorView: EditorView, schema: Schema, next: PmNode): void {
	const scroller = scrollParent(editorView.dom);
	editorView.updateState(stateForDoc(editorView, schema, next));
	if (scroller) scroller.scrollTop = 0;
}
