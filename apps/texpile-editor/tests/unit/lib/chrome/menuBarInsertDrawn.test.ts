// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { editorViewStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { activeFilePath, mainFile } from '$lib/workspace/workspaceStore';
import { makeDrawnInserts } from '$lib/chrome/menubar/menuBarInsertDrawn';

const para = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));

function editorWith(text: string, caretBefore: string): EditorView {
	const doc = schema.nodes.doc.create(null, [para(text)]);
	const at = 1 + text.indexOf(caretBefore);
	const state = EditorState.create({ doc, selection: TextSelection.create(doc, at) });
	const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
	editorViewStore.current = view;
	return view;
}

const insert = makeDrawnInserts({ dialect: () => 'tex', askText: async () => null });

afterEach(() => {
	editorViewStore.current?.destroy();
	editorViewStore.current = null;
	activeFilePath.current = null;
	mainFile.current = null;
	projectIntelStore.current = { ...projectIntelStore.current, bibEntries: [] };
});

it('keeps a command name from running into the word after it', async () => {
	const view = editorWith('before after', 'after');
	await insert('hspace');
	const para = view.state.doc.firstChild!;
	const chip = para.content.content.findIndex((node) => node.type.name === 'inline_latex');
	expect(para.child(chip).textContent).toBe('\\quad');
	// the word after it starts past a space, so \quad never reads as \quadafter
	expect(para.child(chip + 1).text?.startsWith(' ')).toBe(true);
});

it('puts a comment after the paragraph instead of through a word', async () => {
	const view = editorWith('A paragraph before the comments.', 'omments');
	await insert('comment');
	const blocks = view.state.doc.content.content.map((node) => `${node.type.name}:${node.textContent}`);
	expect(blocks).toEqual(['paragraph:A paragraph before the comments.', 'raw_latex:% ']);
});

it('names a .bib in a subfolder by its path from the main file, as BibTeX looks it up', async () => {
	activeFilePath.current = '/project/chapters/intro.tex';
	mainFile.current = '/project/main.tex';
	projectIntelStore.current = { ...projectIntelStore.current, bibEntries: [{ key: 'a', file: '/project/bib/refs.bib', line: 1 }] };
	const view = editorWith('Text.', '.');
	await insert('bibliography');
	const chips: string[] = [];
	view.state.doc.descendants((node) => void (node.type.name === 'inline_latex' && chips.push(node.textContent)));
	expect(chips).toEqual(['\\bibliographystyle{plain}', '\\bibliography{bib/refs}']);
});
