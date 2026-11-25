// a visual editor held as it is drawn while its column's width moves, under its pane's cover (resizeCover), then let
// go with the text that was in view still there
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { VisualView } from '$lib/editor/canvas';
import { ColumnWidth } from '$lib/resizing/columnWidth';

function holdDom(dom: HTMLElement, width: string | null): void {
	for (const property of ['width', 'min-width']) {
		if (width) dom.style.setProperty(property, width);
		else dom.style.removeProperty(property);
	}
}

export function heldWidthPlugin(): Plugin {
	return new Plugin({
		view(editorView: EditorView) {
			const view = editorView as VisualView;
			const width = new ColumnWidth(view.dom.parentElement ?? view.dom, {
				// the canvas lays out in its own frame: nothing slow follows a width change for the next one to wait on
				breakNow: () => width.breaking(),
				hold() {
					if (view.isDestroyed || !width.moving) return;
					holdDom(view.dom, `${view.dom.getBoundingClientRect().width}px`);
					view.canvas.holdWidth();
				},
				rest() {
					width.breaking();
					if (view.isDestroyed) return;
					holdDom(view.dom, null);
					view.canvas.releaseWidth();
				}
			});
			return { destroy: () => width.destroy() };
		}
	});
}
