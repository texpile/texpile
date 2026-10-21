// the chip's LaTeX in its panel: a small CodeMirror in the source editor's colors, whose undo is the document's own
import { EditorView as CMView, keymap, drawSelection } from '@codemirror/view';
import { Compartment, Prec } from '@codemirror/state';
import { closeCompletion, currentCompletions } from '@codemirror/autocomplete';
import { defaultKeymap } from '@codemirror/commands';
import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { latexAutocomplete } from '$lib/languages/latex/intellisense/intellisense';
import { singleLineGuard } from '../raw-latex/inlineLatexView';

export type ChipSourceEditorOptions = {
	text: string;
	language: 'latex' | 'typst';
	inline: boolean;
	write(next: string): void;
	undo(): void;
	redo(): void;
	close(): void;
	/** where the caret starts, else the start of the text */
	caret?: number;
};

export type ChipSourceEditor = { view: CMView; setText(text: string): void };

// CodeMirror's completion takes Escape while a source is merely active, with no list on screen; then it reaches the panel
function dropHiddenCompletion(view: CMView): boolean {
	if (currentCompletions(view.state).length === 0) closeCompletion(view);
	return false;
}

export function chipSourceEditor(parent: HTMLElement, options: ChipSourceEditorOptions): ChipSourceEditor {
	const language = new Compartment();
	let syncing = false;
	function run(action: () => void) {
		return () => (action(), true);
	}
	const view = new CMView({
		parent,
		doc: options.text,
		selection: { anchor: Math.min(options.caret ?? 0, options.text.length) },
		extensions: [
			keymap.of([
				{ key: options.inline ? 'Enter' : 'Mod-Enter', run: run(options.close) },
				{ key: 'Mod-z', run: run(options.undo) },
				{ key: 'Mod-y', run: run(options.redo) },
				{ key: 'Shift-Mod-z', run: run(options.redo) },
				...defaultKeymap
			]),
			drawSelection(),
			CMView.lineWrapping,
			language.of(options.language === 'latex' ? latex() : []),
			cmSyntaxHighlight(),
			// ahead of the completion's own keymap, which is highest too
			Prec.highest(keymap.of([{ key: 'Escape', run: dropHiddenCompletion }])),
			...(options.language === 'latex' ? [latexAutocomplete({ tooltipsInBody: true })] : []),
			...(options.inline ? [singleLineGuard] : []),
			CMView.contentAttributes.of({ spellcheck: 'false', 'data-gramm': 'false', 'data-enable-grammarly': 'false' }),
			CMView.updateListener.of((update) => {
				if (update.docChanged && !syncing) options.write(update.state.doc.toString());
			}),
			CMView.theme({
				'&': { backgroundColor: 'transparent', maxHeight: '12rem' },
				'&.cm-focused': { outline: 'none' },
				'.cm-scroller': { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', lineHeight: '1.5' },
				'.cm-content': { padding: '0.25rem 0' },
				'.cm-line': { padding: '0 0.5rem' }
			})
		]
	});
	if (options.language === 'typst') {
		// the app ships its own wasm-backed Typst language, loaded on demand
		void import('$lib/languages/typst/source/typstLanguage').then(({ typstIslandLanguage }) =>
			view.dispatch({ effects: language.reconfigure(typstIslandLanguage()) })
		);
	}
	return {
		view,
		setText(text: string): void {
			if (text === view.state.doc.toString()) return;
			syncing = true;
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
			syncing = false;
		}
	};
}
