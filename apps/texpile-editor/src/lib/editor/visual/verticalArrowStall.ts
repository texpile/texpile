// Safari's Down stops at a line the line breaker ends in a soft hyphen; a key that moved nothing moves by place
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

function moveByPlace(view: EditorView, head: number, down: boolean): void {
	const box = view.coordsAtPos(head);
	const line = Math.max(box.bottom - box.top, 1);
	const hit = view.posAtCoords({ left: box.left, top: down ? box.bottom + line / 2 : box.top - line / 2 });
	if (!hit || hit.pos === head) return;
	const $hit = view.state.doc.resolve(hit.pos);
	if (!$hit.parent.inlineContent) return;
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.pos)).scrollIntoView());
}

export function verticalArrowStall(): Plugin {
	return new Plugin({
		props: {
			handleKeyDown(view, event) {
				if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
				if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
				const { selection } = view.state;
				const dom = view.dom.ownerDocument.getSelection();
				if (!(selection instanceof TextSelection) || !selection.empty || !dom?.focusNode) return false;
				const [node, offset] = [dom.focusNode, dom.focusOffset];
				setTimeout(() => {
					const now = view.dom.ownerDocument.getSelection();
					if (view.isDestroyed || !view.hasFocus() || !view.state.selection.eq(selection)) return;
					if (now?.focusNode === node && now.focusOffset === offset) moveByPlace(view, selection.head, event.key === 'ArrowDown');
				});
				return false;
			}
		}
	});
}
