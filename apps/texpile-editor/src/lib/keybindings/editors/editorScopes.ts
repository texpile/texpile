// the context keys of an editor, for when clauses: which editor has the focus and in what language
import { Plugin } from 'prosemirror-state';
import { ViewPlugin } from '@codemirror/view';
import { contextScopeOn } from '../context/contextKeys';

export type EditorLanguage = 'latex' | 'typst' | 'markdown' | 'bibtex' | 'other';

export function pmEditorScope(language: EditorLanguage): Plugin {
	return new Plugin({
		view(view) {
			const scope = contextScopeOn(view.dom, { visualEditorFocus: true, editorLanguage: language });
			return { destroy: scope.dispose };
		}
	});
}

export function cmEditorScope(language: EditorLanguage) {
	return ViewPlugin.define((view) => {
		const scope = contextScopeOn(view.dom, { sourceEditorFocus: true, editorLanguage: language });
		return { destroy: scope.dispose };
	});
}

export function languageOfFile(path: string): EditorLanguage {
	if (!path || /\.(tex|cls|sty|bbl|tikz)$/i.test(path)) return 'latex';
	if (/\.typ$/i.test(path)) return 'typst';
	if (/\.(md|markdown)$/i.test(path)) return 'markdown';
	return /\.bib$/i.test(path) ? 'bibtex' : 'other';
}
