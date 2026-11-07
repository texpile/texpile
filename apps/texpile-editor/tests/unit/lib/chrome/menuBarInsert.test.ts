// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { EditorState as CMState } from '@codemirror/state';
import { EditorView as CMView } from '@codemirror/view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { editorViewStore, sourceCmView, viewMode } from '$lib/stores/editorStore';
import { makeInsertHandlers } from '$lib/chrome/menubar/insert/menuBarInsert';
import { insertItems } from '$lib/editor/visual/insert/insertItems.svelte';
import { documentFileIds, documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { latexInsertItems } from '$lib/languages/latex/visual/core/plugin/insertList';

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
	it('writes the \\cite every bibliography package defines in the visual editor, its key left for the user', async () => {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('See .'))]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) });
		const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
		editorViewStore.current = view;
		await insertSelect('citation');
		expect(serializeToLatex(view.state.doc)).toContain('See \\cite{}.');
	});

	it('writes it in the source editor too', async () => {
		sourceCmView.current = new CMView({ state: CMState.create({ doc: 'See ' }), parent: document.body });
		sourceCmView.current.dispatch({ selection: { anchor: 4 } });
		viewMode.current = 'source';
		await insertSelect('citation');
		expect(sourceCmView.current.state.doc.toString()).toBe('See \\cite{}');
	});
});

describe('Insert from the class', () => {
	it("puts in a frame from a Beamer deck's list after the paragraph at the caret", async () => {
		const text = '\\documentclass{beamer}\n\\begin{document}\n';
		insertItems.current = latexInsertItems({ loaded: await documentPackages(text), direct: documentFileIds(text), definitions: text });
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Intro'))]);
		const view = new EditorView(document.body.appendChild(document.createElement('div')), { state: EditorState.create({ doc }) });
		editorViewStore.current = view;
		await insertSelect('item:frame');
		expect(serializeToLatex(view.state.doc)).toMatch(/Intro\s+\\begin\{frame\}[\s\S]*\\end\{frame\}/);
	});

	it('adds amsmath for an align the file has no package for, once', () => {
		const { mathSelect } = makeInsertHandlers({ dialect: () => 'tex', askText: async () => null, pickImage: () => {} });
		const text = '\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n';
		sourceCmView.current = new CMView({ state: CMState.create({ doc: text }), parent: document.body });
		sourceCmView.current.dispatch({ selection: { anchor: text.indexOf('\n\n') + 1 } });
		viewMode.current = 'source';
		mathSelect('align');
		mathSelect('align');
		expect(sourceCmView.current.state.doc.toString().match(/\\usepackage\{amsmath\}/g)).toHaveLength(1);
	});
});

describe('Insert a block with the caret inside a paragraph', () => {
	function openAt(text: string, at: number) {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text(text))]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, at) });
		const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
		editorViewStore.current = view;
		return view;
	}

	function blocksOf(view: EditorView): string[] {
		const kinds: string[] = [];
		view.state.doc.forEach((n) => kinds.push(`${n.type.name}:${n.textContent}`));
		return kinds;
	}

	it('puts LaTeX Code in as an empty raw block after the paragraph', async () => {
		const view = openAt('First alpha beta', 8);
		await insertSelect('rawlatex');
		expect(blocksOf(view)).toEqual(['paragraph:First alpha beta', 'raw_latex:']);
	});

	it('puts Horizontal Rule in after the paragraph and leaves its words whole', async () => {
		const view = openAt('First alpha beta', 8);
		await insertSelect('hrule');
		expect(blocksOf(view)).toEqual(['paragraph:First alpha beta', 'horizontal_rule:', 'paragraph:']);
	});

	it('puts Pause at the caret inside the paragraph', async () => {
		const text = '\\documentclass{beamer}\n\\begin{document}\n';
		insertItems.current = latexInsertItems({ loaded: await documentPackages(text), direct: documentFileIds(text), definitions: text });
		const view = openAt('Some words', 5);
		await insertSelect('item:\\pause');
		expect(serializeToLatex(view.state.doc)).toMatch(/Some\s*\\pause\s*words/);
	});

	it('puts Page Break in with the caret left in the text', async () => {
		const view = openAt('First paragraph alpha', 5);
		await insertSelect('pagebreak');
		expect(serializeToLatex(view.state.doc)).toContain('\\newpage');
		expect(view.state.selection.$from.parent.isTextblock && view.state.selection.$from.parent.type.name).toBe('paragraph');
	});
});
