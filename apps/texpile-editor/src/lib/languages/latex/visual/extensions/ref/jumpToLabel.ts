// a reference's click: to its label when it is in this document, else the workspace decides (another file)
import type { EditorView } from 'prosemirror-view';
import { flashNodeAt } from '$lib/editor/visual/extensions/flash-plugin';
import { jumpScrollShift } from '$lib/editor/jumpPlacement';
import { labelPos } from '$lib/editor/visual/labelTaken';

export function jumpToLabel(view: EditorView, label: string, onJumpToLabel?: (name: string) => boolean): void {
	const pos = label ? labelPos(view.state.doc, label) : null;
	if (pos === null) {
		onJumpToLabel?.(label);
		return;
	}
	const at = view.canvas.nodeClientRect(pos)?.rect ?? view.canvas.rangeClientRects(pos, pos + 1)[0];
	const pane = view.canvas.scroller.getBoundingClientRect();
	if (!at || jumpScrollShift(at, pane) !== null) view.canvas.revealPos(pos, 'center', 'smooth');
	// the top-level block the label sits in flashes the way a SyncTeX landing does
	const $pos = view.state.doc.resolve(pos);
	flashNodeAt(view, $pos.depth ? $pos.before(1) : pos);
}
