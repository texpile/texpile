import { EditorView as CMView } from '@codemirror/view';
import type { StateEffect } from '@codemirror/state';
import { jumpScrollShift } from '$lib/editor/jumpPlacement';

export function jumpRevealEffect(view: CMView, pos: number): StateEffect<unknown> {
	const block = view.lineBlockAt(pos);
	const top = view.documentTop + block.top;
	const shift = jumpScrollShift({ top, bottom: top + block.height }, view.scrollDOM.getBoundingClientRect());
	return CMView.scrollIntoView(pos, { y: shift == null ? 'nearest' : 'center', yMargin: 0 });
}
