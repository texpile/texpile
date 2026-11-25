// prosemirror-view's captureKeyDown (capturekeys.ts, 1.42.9) for the keys the caret engine does not move by: deletes, Escape and
// Enter, and the formatting keys the browser must not act on
import { NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { Platform } from '$lib/editor/keys/platformKeys';
import type { VisualView } from '../../contracts/viewTypes';

function apply(view: VisualView, selection: Selection): true {
	view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
	return true;
}

/** true: the native delete must not run (it would cross a textblock or an inline node, which this deleted itself) */
function stopNativeHorizontalDelete(view: VisualView, dir: number): boolean {
	if (!(view.state.selection instanceof TextSelection)) return true;
	const { $head, $anchor, empty } = view.state.selection;
	if (!$head.sameParent($anchor)) return true;
	if (!empty) return false;
	if (view.endOfTextblock(dir > 0 ? 'forward' : 'backward')) return true;
	const nextNode = !$head.textOffset && (dir < 0 ? $head.nodeBefore : $head.nodeAfter);
	if (nextNode && !nextNode.isText) {
		const tr = view.state.tr;
		if (dir < 0) tr.delete($head.pos - nextNode.nodeSize, $head.pos);
		else tr.delete($head.pos, $head.pos + nextNode.nodeSize);
		view.dispatch(tr);
		return true;
	}
	return false;
}

function modsOf(event: KeyboardEvent): string {
	return (event.ctrlKey ? 'c' : '') + (event.metaKey ? 'm' : '') + (event.altKey ? 'a' : '') + (event.shiftKey ? 's' : '');
}

export function captureKeys(view: VisualView, event: KeyboardEvent, platform: Platform): boolean {
	const code = event.keyCode;
	const mods = modsOf(event);
	const mac = platform === 'mac';
	if (code === 8 || (mac && code === 72 && mods === 'c')) return stopNativeHorizontalDelete(view, -1);
	if ((code === 46 && !event.shiftKey) || (mac && code === 68 && mods === 'c')) return stopNativeHorizontalDelete(view, 1);
	if (code === 27) {
		const { selection } = view.state;
		if (selection instanceof NodeSelection && selection.node.isInline && !mods) return apply(view, new TextSelection(selection.$to));
		return true;
	}
	if (code === 13) return true;
	return mods === (mac ? 'm' : 'c') && (code === 66 || code === 73 || code === 89 || code === 90);
}
