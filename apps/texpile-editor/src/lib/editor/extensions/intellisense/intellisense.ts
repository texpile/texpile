// public entry point for the intellisense module: completion, keyboard shortcuts, hover, folding,
// and go-to-definition, composed for either a .tex buffer or a .bib buffer.
import { autocompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { EditorView, tooltips } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';
import { latexCompletionSource, bibFileCompletionSource } from './completion/dispatch';
import { frecencyTracker } from './completion/frecency';
import { formatShortcuts } from './shortcuts';
import { latexHover } from './hover';
import { latexFolding } from './fold';
import { goToDefinition, type DefinitionHooks } from './definition';

export { latexCompletionSource, bibFileCompletionSource };

interface IntellisenseOptions {
	/** popup escapes a node's own box; needed for completions/hover inside a raw/inline LaTeX chip. */
	tooltipsInBody?: boolean;
	/** .bib files get entry-type/field completion instead of the LaTeX macro/citation/ref dispatch. */
	bib?: boolean;
}

// CodeMirror re-queries completion only on INSERTED text: deletions never reactivate it, and any
// cursor move closes the session outright. both repairs funnel through the normal dispatch, so
// nothing appears unless a source matches the new position:
//  - after a user deletion with no active session, re-query (backspacing over a typo revives the list)
//  - after a KEYBOARD cursor move that lands inside a \macro token, re-query (walking left through
//    a misspelling resurfaces the popup as soon as the prefix becomes matchable); pointer moves
//    stay quiet so clicking around never pops uninvited lists
const inMacroToken = (state: EditorState, pos: number): boolean => {
	const line = state.doc.lineAt(pos);
	return /\\[a-zA-Z]*$/.test(line.text.slice(0, pos - line.from));
};

const reactivate = EditorView.updateListener.of((update) => {
	if (completionStatus(update.state) !== null) return; // active session: CM manages it
	if (update.docChanged) {
		if (update.transactions.some((tr) => tr.isUserEvent('delete'))) startCompletion(update.view);
		return;
	}
	if (!update.selectionSet) return;
	const keyboardMove = update.transactions.some((tr) => tr.isUserEvent('select') && !tr.isUserEvent('select.pointer'));
	if (keyboardMove && inMacroToken(update.state, update.state.selection.main.head)) startCompletion(update.view);
});

/** completion only — used inside the WYSIWYG editor's raw/inline LaTeX node views. */
export function latexAutocomplete(opts: IntellisenseOptions = {}): Extension {
	const source = opts.bib ? bibFileCompletionSource : latexCompletionSource;
	const ext: Extension[] = [autocompletion({ override: [source], activateOnTyping: true, icons: false }), reactivate, frecencyTracker()];
	if (opts.tooltipsInBody) ext.push(tooltips({ parent: document.body }));
	return ext;
}

/** completion + shortcuts + hover + folding + go-to-definition, for the full Source-mode editor. */
export function latexIntellisense(opts: IntellisenseOptions & DefinitionHooks = {}): Extension {
	const ext: Extension[] = [latexAutocomplete(opts)];
	if (!opts.bib) {
		ext.push(
			formatShortcuts(),
			latexHover(),
			latexFolding(),
			goToDefinition({ onJumpToFile: opts.onJumpToFile, onOpenFileAt: opts.onOpenFileAt })
		);
	}
	return ext;
}
