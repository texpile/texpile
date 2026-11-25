// syncs the cursorInCm store the menu bar uses to disable commands that would eat raw blocks
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { cursorInCm } from '$lib/stores/editorStore';

const CM_NODE_TYPES = new Set(['raw_latex', 'code_block', 'block_math']);

function isCursorInCm(state: EditorState): boolean {
	const $from = state.selection.$from;
	for (let d = $from.depth; d >= 0; d--) {
		if (CM_NODE_TYPES.has($from.node(d).type.name)) return true;
	}
	return false;
}

export const cursorPluginKey = new PluginKey('cursor');

export function createCursorPlugin() {
	return new Plugin({
		key: cursorPluginKey,
		view(view) {
			// only the focused editor's caret is the menus' business
			let last = isCursorInCm(view.state);
			if (view.editable) cursorInCm.current = last;
			return {
				update(v) {
					const cur = isCursorInCm(v.state);
					if (cur !== last && v.editable) {
						last = cur;
						cursorInCm.current = cur;
					}
				},
				destroy() {
					// reset so a stale true doesn't keep the menus disabled
					if (view.editable) cursorInCm.current = false;
				}
			};
		}
	});
}
