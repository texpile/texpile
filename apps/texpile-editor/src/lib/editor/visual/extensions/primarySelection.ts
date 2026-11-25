// Linux PRIMARY on the canvas: a settled selection is what a middle press pastes, here or in another app, and a middle
// press here pastes PRIMARY where it lands, as a contenteditable did on its own
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { isMac, isWindows } from '$lib/platform';
import { nativeBridge } from '$lib/workspace/fileSystem';

const SETTLE_MS = 150;

function pasteSelectionAt(view: EditorView, event: MouseEvent): boolean {
	const read = nativeBridge()?.clipboardReadSelection;
	const at = read && view.posAtCoords({ left: event.clientX, top: event.clientY });
	if (!read || !at || !view.editable) return false;
	event.preventDefault();
	view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
	view.focus();
	void read().then((text) => text && view.pasteText(text));
	return true;
}

export function primarySelectionPlugin(): Plugin {
	const linux = !isMac && !isWindows;
	return new Plugin({
		view() {
			let timer: ReturnType<typeof setTimeout> | undefined;
			return {
				update(view, prev) {
					const write = nativeBridge()?.clipboardWriteSelection;
					if (!linux || !write || view.state.selection.eq(prev.selection)) return;
					clearTimeout(timer);
					timer = setTimeout(() => {
						const { selection } = view.state;
						if (!selection.empty && view.hasFocus()) write(view.serializeForClipboard(selection.content()).text);
					}, SETTLE_MS);
				},
				destroy: () => clearTimeout(timer)
			};
		},
		props: {
			handleDOMEvents: {
				mousedown: (view, event) => event.button === 1 && !!nativeBridge()?.middlePastesSelection && pasteSelectionAt(view, event)
			}
		}
	});
}
