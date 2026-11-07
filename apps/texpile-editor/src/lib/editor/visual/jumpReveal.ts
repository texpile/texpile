import type { EditorView } from 'prosemirror-view';
import { jumpScrollShift } from '$lib/editor/jumpPlacement';
import { scrollParent } from './scrollParent';

export function revealPosInCenter(view: EditorView, pos: number = view.state.selection.head, behavior: ScrollBehavior = 'auto'): void {
	const scroller = scrollParent(view.dom);
	if (!scroller) return;
	try {
		const shift = jumpScrollShift(view.coordsAtPos(pos), scroller.getBoundingClientRect());
		if (shift != null) scroller.scrollTo({ top: scroller.scrollTop + shift, behavior });
	} catch {
		// position not drawn
	}
}
