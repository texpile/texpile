import type { EditorView } from 'prosemirror-view';

/** a closed popover gives the keys back to the text, unless the close came from focus going elsewhere (Find in Files) */
export function returnFocusToText(view: EditorView): void {
	requestAnimationFrame(() => {
		const active = view.dom.ownerDocument.activeElement;
		const lost = !active || active === view.dom.ownerDocument.body || !active.isConnected;
		if (lost || view.dom.contains(active)) view.focus();
	});
}
