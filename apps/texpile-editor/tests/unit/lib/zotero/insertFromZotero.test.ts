import { describe, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { editorViewStore } from '$lib/stores/editorStore';
import { insertCitation } from '$lib/zotero/insertFromZotero';

describe('a citation picked in Zotero', () => {
	// \autocite is biblatex's alone: a natbib or plain BibTeX document stopped compiling
	it('lands in the visual editor as the \\cite every bibliography package defines', () => {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('See .')])]);
		let state = EditorState.create({ doc });
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));
		const view = {
			dom: { isConnected: true },
			get state() {
				return state;
			},
			dispatch: (tr: typeof state.tr) => (state = state.apply(tr)),
			focus: () => {}
		};
		editorViewStore.current = view as unknown as EditorView;
		insertCitation(['knuth84'], 'tex');
		editorViewStore.current = null;
		expect(serializeToLatex(state.doc)).toContain('See \\cite{knuth84}.');
	});
});
