// nothing is dropped on the block standing for blocks a suggestion took out
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

// the block is not the document, so a drop on it lands where the blocks were taken out, among the suggestion's own parts
function overGoneBlocks(view: EditorView, event: DragEvent): boolean {
	const hit = view.canvas.geometry.hit(view.canvas.docPoint({ x: event.clientX, y: event.clientY }));
	return !!hit?.chain[0]?.closest('.pm-suggest-gone');
}

export function refuseDropOnGoneBlocks(): Plugin {
	// on the page: the drop indicator reads it, and one already showing has to go
	function refuse(view: EditorView, on: boolean) {
		view.dom.ownerDocument.documentElement.classList.toggle('pm-drop-refused', on);
	}
	return new Plugin({
		props: {
			handleDOMEvents: {
				dragover(view, event) {
					const over = overGoneBlocks(view, event);
					refuse(view, over);
					// a dragover that accepts a drop with no effect shows the pointer as no drop
					const transfer = event.dataTransfer;
					if (over && transfer) transfer.dropEffect = 'none';
					return false;
				},
				drop(view, event) {
					refuse(view, false);
					if (!overGoneBlocks(view, event)) return false;
					event.preventDefault();
					return true;
				},
				dragend(view) {
					refuse(view, false);
					return false;
				}
			}
		}
	});
}
