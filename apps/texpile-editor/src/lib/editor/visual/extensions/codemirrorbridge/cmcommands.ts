import type { EditorState, Transaction } from 'prosemirror-state';
import { insertBlockAtCaret } from '$lib/editor/visual/insert/insertRun';

export function createCodeBlock(): (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean {
	return function (state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		const tr = insertBlockAtCaret(state, { select: 'in', make: (schema) => schema.nodes.code_block.createAndFill() });
		if (tr) dispatch?.(tr);
		return !!tr;
	};
}
