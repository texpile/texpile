// Ctrl+Space inside math opens the math search in place of the suggestions, the same key as in a visual equation;
// Tab keeps its code editor meaning, and Emacs keeps Ctrl+Space for its mark
import { closeCompletion } from '@codemirror/autocomplete';
import { Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { mathSearch } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearch.svelte';
import { isSearchKey, MODIFIERS, takeSearchKey } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearchKeys';
import { settings } from '$lib/settings';
import { mathAtCaret } from '../math-preview/mathPreview';

/** a caret, not a selection, between math delimiters in a file the user may edit */
function caretInMath(view: EditorView): boolean {
	const { state } = view;
	return !state.readOnly && state.selection.ranges.length === 1 && state.selection.main.empty && mathAtCaret(state) !== null;
}

export function sourceMathSearch(): Extension {
	return [
		// before every keymap, codemirror's Ctrl-Space for suggestions among them
		Prec.highest(
			EditorView.domEventHandlers({
				keydown(event, view) {
					if (mathSearch.source === view) {
						// while the search is open the editor keeps the focus, so its keys are taken here first
						if (MODIFIERS.has(event.key) || !takeSearchKey(event)) return false;
					} else if (isSearchKey(event) && settings.current.editorKeymap !== 'emacs' && caretInMath(view)) {
						closeCompletion(view);
						mathSearch.openSource(view, mathAtCaret(view.state)?.kind === 'display');
					} else return false;
					event.preventDefault();
					return true;
				}
			})
		),
		// a pick goes in at the caret, so a click elsewhere closes it
		EditorView.updateListener.of((update) => {
			if (update.selectionSet && mathSearch.source === update.view) mathSearch.close();
		})
	];
}
