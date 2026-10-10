// Tab inside math in the source editor opens the math search the visual editor's equations have;
// Shift+Tab there inserts a plain indent instead, so a real one is still a key away
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { mathSearch } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearch.svelte';
import { MODIFIERS, takeSearchKey } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearchKeys';
import { indentAtCaret } from '../keybindings/cmTabKey';
import { mathAtCaret } from '../math-preview/mathPreview';

/** a caret, not a selection, between math delimiters in a file the user may edit */
function caretInMath(view: EditorView): boolean {
	const { state } = view;
	return !state.readOnly && state.selection.ranges.length === 1 && state.selection.main.empty && mathAtCaret(state) !== null;
}

export function sourceMathSearch(): Extension {
	return [
		// while the search is open the editor keeps the focus, so its keys are taken here first
		Prec.highest(
			EditorView.domEventHandlers({
				keydown(event, view) {
					if (mathSearch.source !== view || MODIFIERS.has(event.key) || !takeSearchKey(event)) return false;
					event.preventDefault();
					return true;
				}
			})
		),
		Prec.high(
			keymap.of([
				{
					key: 'Tab',
					run: (view) => caretInMath(view) && (mathSearch.openSource(view), true),
					shift: (view) => caretInMath(view) && indentAtCaret(view)
				}
			])
		)
	];
}
