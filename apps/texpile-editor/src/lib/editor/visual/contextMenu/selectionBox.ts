import type { EditorView } from 'prosemirror-view';
import type { OverlayAnchor } from '$lib/editor/canvas';

function measured(anchor: OverlayAnchor): DOMRect | null {
	const box = anchor.clientRect();
	anchor.dispose();
	return box;
}

/** the selected text's box in client px, as the DOM selection's range measured it */
export function selectionBox(view: EditorView): DOMRect | null {
	const { from, to, empty } = view.state.selection;
	return empty ? null : measured(view.canvas.anchors.range(from, to));
}

/** the caret, or the selection's first line: the rect Chromium opens a keyboard menu from in a DOM editor */
export function selectionFirstLine(view: EditorView): DOMRect | null {
	const { from, to, empty } = view.state.selection;
	if (empty) return measured(view.canvas.anchors.caret());
	return view.canvas.rangeClientRects(from, to, 'text')[0] ?? view.canvas.nodeClientRect(from)?.rect ?? null;
}
