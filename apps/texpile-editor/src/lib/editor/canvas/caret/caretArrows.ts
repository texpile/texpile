// the arrow keys, plain and with Shift, all through the caret engine (caretMoves.ts). It runs before the table plugin, so
// a cell is left as any block is; a popup or a nested editor (a formula, a code block) has taken its keys before it
import { Plugin } from 'prosemirror-state';
import type { VisualView } from '../contracts/viewTypes';
import { arrowMove } from './caretMoves';

const KEYS: Record<string, ['horizontal' | 'vertical', -1 | 1]> = {
	ArrowLeft: ['horizontal', -1],
	ArrowRight: ['horizontal', 1],
	ArrowUp: ['vertical', -1],
	ArrowDown: ['vertical', 1]
};

function onKey(view: VisualView, event: KeyboardEvent): boolean {
	const key = KEYS[event.key];
	if (!key || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return false;
	return arrowMove(view, key[0], key[1], event.shiftKey);
}

export function caretArrowsPlugin(): Plugin {
	return new Plugin({ props: { handleKeyDown: (view, event) => onKey(view as unknown as VisualView, event) } });
}
