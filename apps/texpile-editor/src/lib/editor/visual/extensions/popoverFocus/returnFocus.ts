import type { EditorView } from 'prosemirror-view';

export function returnFocusToText(view: EditorView): void {
	requestAnimationFrame(() => {
		const active = view.dom.ownerDocument.activeElement;
		const lost = !active || active === view.dom.ownerDocument.body || !active.isConnected;
		if (lost || view.dom.contains(active)) view.focus();
	});
}
