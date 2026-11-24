// OS input types that carry no text (11.2): Enter, line breaks, the Edit menu's undo and the OS's own deletions go to the router
import { intentForInputType } from '$lib/editor/keys/platformKeys';
import { redoVisual, undoVisual } from '$lib/editor/visual/visualUndo';
import type { KeyRouter } from '../keys/keyRouter';

function keyEvent(key: string, shiftKey: boolean): KeyboardEvent {
	return new KeyboardEvent('keydown', { key, code: key, keyCode: 13, shiftKey, cancelable: true });
}

/** true when the canvas took the input type; the surface has already cancelled the browser's own edit */
export function runInputType(keys: KeyRouter, inputType: string): boolean {
	switch (inputType) {
		case 'insertParagraph':
			return keys.keydown(keyEvent('Enter', false));
		case 'insertLineBreak':
			return keys.keydown(keyEvent('Enter', true));
		case 'historyUndo':
			return undoVisual();
		case 'historyRedo':
			return redoVisual();
		default: {
			const intent = intentForInputType(inputType);
			return !!intent && keys.runIntent(intent);
		}
	}
}
