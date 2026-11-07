import { EditorView as CMView } from '@codemirror/view';
import type { KeyBinding } from '@codemirror/view';
import { yUndoManagerKeymap } from 'y-codemirror.next';
import { changedSpan } from '$lib/editor/changedSpan';
import { jumpRevealEffect } from './cmJumpReveal';

// a step made elsewhere (the visual editor) carries no caret for this view to restore
function stepFileHistory(key: KeyBinding) {
	return (view: CMView): boolean => {
		const before = view.state.doc.toString();
		key.run?.(view);
		const span = changedSpan(before, view.state.doc.toString());
		if (span) view.dispatch({ selection: { anchor: span.to }, effects: jumpRevealEffect(view, span.to) });
		return true;
	};
}

export const fileHistoryKeymap: KeyBinding[] = [
	{ key: 'Mod-z', run: stepFileHistory(yUndoManagerKeymap[0]), preventDefault: true },
	{ key: 'Mod-y', mac: 'Mod-Shift-z', run: stepFileHistory(yUndoManagerKeymap[2]), preventDefault: true },
	{ key: 'Mod-Shift-z', run: stepFileHistory(yUndoManagerKeymap[2]), preventDefault: true }
];
