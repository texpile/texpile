// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { EditorState as CMState } from '@codemirror/state';
import { EditorView as CMView } from '@codemirror/view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { editorViewStore, sourceCmView, viewMode } from '$lib/stores/editorStore';
import { makeInsertHandlers } from '$lib/chrome/menubar/menuBarInsert';

const { insertSelect } = makeInsertHandlers({ dialect: () => 'tex', askText: async () => null, pickImage: () => {} });

afterEach(() => {
	editorViewStore.current?.destroy();
	editorViewStore.current = null;
	sourceCmView.current?.destroy();
	sourceCmView.current = null;
	viewMode.current = 'visual';
});

// \autocite is biblatex's alone: a natbib or plain BibTeX document stopped compiling
describe('Insert > Citation in a LaTeX file', () => {
	it('writes the \\cite every bibliography package defines in the visual editor', async () => {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('See .'))]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) });
		const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
		editorViewStore.current = view;
		await insertSelect('citation');
		expect(serializeToLatex(view.state.doc)).toContain('See \\cite{key}.');
	});

	it('writes it in the source editor too', async () => {
		sourceCmView.current = new CMView({ state: CMState.create({ doc: 'See ' }), parent: document.body });
		sourceCmView.current.dispatch({ selection: { anchor: 4 } });
		viewMode.current = 'source';
		await insertSelect('citation');
		expect(sourceCmView.current.state.doc.toString()).toBe('See \\cite{key}');
	});
});
