// Chrome puts back a node selection when a press focuses the editor again (a figure, a chip whose panel closed), so
// the caret stayed on the node and the next key replaced it. A press elsewhere takes the caret where it lands.
import { NodeSelection, Plugin, Selection } from 'prosemirror-state';

export function unfocusedPressCaret(): Plugin {
	return new Plugin({
		props: {
			handleDOMEvents: {
				mousedown(view, event) {
					const { selection } = view.state;
					if (event.button !== 0 || view.hasFocus() || !(selection instanceof NodeSelection)) return false;
					if (view.nodeDOM(selection.from)?.contains(event.target as Node)) return false;
					const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
					if (!at) return false;
					view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(at.pos))));
					return false;
				}
			}
		}
	});
}
