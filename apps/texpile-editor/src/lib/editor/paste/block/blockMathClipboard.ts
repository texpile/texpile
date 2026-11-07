import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

type FieldSelection = { selection?: { ranges?: [number, number][] } };

// a selected display formula has its MathLive field focused, which copies only its own text; the block goes whole
function ownsClipboard(view: EditorView, event: ClipboardEvent): boolean {
	const { selection } = view.state;
	if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'block_math' || !event.clipboardData) return false;
	const field = event.target instanceof Element ? event.target.closest('math-field') : null;
	const ranges = (field as FieldSelection | null)?.selection?.ranges ?? [];
	return ranges.every(([from, to]) => from === to);
}

/** copy and cut of a selected display formula put the formula block on the clipboard, as they do for any block */
export function blockMathClipboard(view: EditorView): { destroy(): void } {
	function onClipboard(event: ClipboardEvent): void {
		if (!ownsClipboard(view, event)) return;
		const { dom, text } = view.serializeForClipboard(view.state.selection.content());
		event.preventDefault();
		event.stopPropagation();
		event.clipboardData!.clearData();
		event.clipboardData!.setData('text/html', dom.innerHTML);
		event.clipboardData!.setData('text/plain', text);
		if (event.type === 'cut') view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
	}
	view.dom.addEventListener('copy', onClipboard, true);
	view.dom.addEventListener('cut', onClipboard, true);
	return {
		destroy() {
			view.dom.removeEventListener('copy', onClipboard, true);
			view.dom.removeEventListener('cut', onClipboard, true);
		}
	};
}
