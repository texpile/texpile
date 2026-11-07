// a reference's click: to its label when the label is drawn in this document, else the workspace decides (another file)
import type { EditorView } from 'prosemirror-view';
import { flashNodeAt } from '$lib/editor/visual/extensions/flash-plugin';
import { revealElementInCenter } from '$lib/editor/jumpPlacement';

// the top-level block the anchor sits in, flashed the way a SyncTeX landing is. found by containment, not identity:
// the anchor can be an inline \label chip inside a paragraph
function flashBlockHolding(view: EditorView, el: Element): void {
	const doc = view.state.doc;
	for (let i = 0, pos = 0; i < doc.childCount; pos += doc.child(i).nodeSize, i++) {
		if (view.nodeDOM(pos)?.contains(el)) return flashNodeAt(view, pos);
	}
}

// matching in js rather than in the selector keeps a label with a quote in it from breaking the query
export function jumpToLabel(view: EditorView, label: string, onJumpToLabel?: (name: string) => boolean): void {
	for (const el of view.dom.querySelectorAll('[data-label], [imageplugin-label]')) {
		if (el.getAttribute('data-label') !== label && el.getAttribute('imageplugin-label') !== label) continue;
		revealElementInCenter(el, 'smooth');
		flashBlockHolding(view, el);
		return;
	}
	onJumpToLabel?.(label);
}
