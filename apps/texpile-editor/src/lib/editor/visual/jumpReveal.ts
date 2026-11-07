import type { EditorView } from 'prosemirror-view';
import { jumpScrollShift } from '$lib/editor/jumpPlacement';
import { scrollParent } from './scrollParent';

/** a jump to `pos` puts it in the middle of the viewport when outside it and leaves the scroll alone when visible */
export function revealPosInCenter(view: EditorView, pos: number = view.state.selection.head, behavior: ScrollBehavior = 'auto'): void {
	const scroller = scrollParent(view.dom);
	if (!scroller) return;
	try {
		const shift = jumpScrollShift(view.coordsAtPos(pos), scroller.getBoundingClientRect());
		if (shift != null) scroller.scrollTo({ top: scroller.scrollTop + shift, behavior });
	} catch {
		/* a position the view does not draw */
	}
}
