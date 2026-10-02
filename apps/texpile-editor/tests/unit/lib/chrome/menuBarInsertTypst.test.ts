// @vitest-environment jsdom
// the Insert menu's Typst items in the visual editor: each goes in the shape the converter reads back, so what was
// inserted is what a reopen shows
import { it, expect, afterEach, describe } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { editorViewStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { makeTypstInserts } from '$lib/chrome/menubar/menuBarInsertTypst';
import { makeInsertHandlers } from '$lib/chrome/menubar/menuBarInsert';
import { symbolPicker } from '$lib/editor/symbols/symbolPicker.svelte';

const para = (text: string) => typSchema.nodes.paragraph.create(null, typSchema.text(text));

function editorWith(text: string, caretBefore: string): EditorView {
	const doc = typSchema.nodes.doc.create(null, [para(text)]);
	const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1 + text.indexOf(caretBefore)) });
	const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
	editorViewStore.current = view;
	return view;
}

const insert = makeTypstInserts({ askText: async () => 'sec:intro' });

afterEach(() => {
	editorViewStore.current?.destroy();
	editorViewStore.current = null;
	activeFilePath.current = null;
	projectIntelStore.current = { ...projectIntelStore.current, bibEntries: [] };
});

describe('the Typst insert items', () => {
	it('put a footnote and a horizontal space among the words', async () => {
		const view = editorWith('A claim here.', ' here');
		await insert('footnote');
		await insert('hspace');
		const out = serializeToTypst(view.state.doc);
		expect(out).toBe('A claim#footnote[]#h(1em) here.');
		expect(serializeToTypst(typstToProseMirror(out).doc)).toBe(out);
	});

	it('put breaks, spaces and outlines after the paragraph, as blocks of their own', async () => {
		const view = editorWith('First paragraph.', 'paragraph');
		await insert('outline');
		const blocks: string[] = [];
		view.state.doc.forEach((node) => blocks.push(`${node.type.name}:${node.textContent}`));
		expect(blocks).toEqual(['paragraph:First paragraph.', 'raw_latex:#outline()']);
		for (const item of ['pagebreak', 'vspace']) expect(await insert(item)).toBe(true);
		const out = serializeToTypst(view.state.doc);
		expect(typstToProseMirror(out).doc.childCount).toBe(view.state.doc.childCount);
	});

	it('names the project’s bibliography files as the Typst file reads them', async () => {
		activeFilePath.current = '/project/chapters/main.typ';
		projectIntelStore.current = {
			...projectIntelStore.current,
			bibEntries: [
				{ key: 'a', file: '/project/chapters/refs.bib', line: 1 },
				{ key: 'b', file: '/project/chapters/refs.bib', line: 9 }
			]
		};
		const view = editorWith('Text.', 'Text');
		await insert('bibliography');
		expect(view.state.doc.lastChild?.textContent).toBe('#bibliography("refs.bib")');
	});

	it('climbs out of the open file’s folder to the bibliography files outside it', async () => {
		activeFilePath.current = '/project/chapters/ch1.typ';
		projectIntelStore.current = {
			...projectIntelStore.current,
			bibEntries: [
				{ key: 'a', file: '/project/library.bib', line: 1 },
				{ key: 'b', file: '/project/data/more.bib', line: 1 }
			]
		};
		const view = editorWith('Text.', 'Text');
		await insert('bibliography');
		expect(view.state.doc.lastChild?.textContent).toBe('#bibliography(("../data/more.bib", "../library.bib"))');
	});

	it('types the @ that opens the reference picker', async () => {
		const view = editorWith('See .', '.');
		await insert('crossref');
		expect(view.state.doc.textContent).toBe('See @.');
	});

	it('puts a label in as its chip', async () => {
		const view = editorWith('Some words', ' words');
		await insert('label');
		const out = serializeToTypst(view.state.doc);
		expect(out).toBe('Some<sec:intro> words');
		expect(serializeToTypst(typstToProseMirror(out).doc)).toBe(out);
	});

	it('opens the symbol picker, which types its pick at the caret', async () => {
		const view = editorWith('A B', ' B');
		expect(await insert('symbolpicker')).toBe(true);
		expect(symbolPicker.open).toBe(true);
		symbolPicker.search('arrow.r');
		symbolPicker.choose(symbolPicker.results[0]);
		expect(view.state.doc.textContent).toBe('A→ B');
	});

	it('leaves every other item to the menu’s other handlers', async () => {
		editorWith('Text.', 'Text');
		expect(await insert('citation')).toBe(false);
		expect(await insert('include')).toBe(false);
	});
});

describe('the Typst math environments', () => {
	const { mathSelect } = makeInsertHandlers({ dialect: () => 'typ', askText: async () => null, pickImage: () => {} });

	for (const [env, typst] of [
		['bmatrix', 'mat(delim: "[", a, b; c, d)'],
		['pmatrix', 'mat(a, b; c, d)'],
		['cases', 'f(x) = cases(x & "if" x >= 0, -x & "otherwise")'],
		['aligned', 'a &= b \\\nc &= d']
	]) {
		it(`${env} goes in as Typst that reads back as the same equation`, () => {
			const view = editorWith('Text.', 'Text');
			mathSelect(env);
			let content = '';
			view.state.doc.descendants((node) => {
				if (node.type.name === 'block_math') content = node.textContent;
			});
			expect(content).toBe(typst);
			const out = serializeToTypst(view.state.doc);
			expect(out).toContain(`$ ${typst} $`);
			const reread = typstToProseMirror(out).doc;
			let back: { type: string; content: string } | null = null;
			reread.descendants((node) => {
				if (node.type.name === 'block_math' || node.type.name === 'raw_latex') back = { type: node.type.name, content: node.textContent };
			});
			expect(back).toMatchObject({ type: 'block_math' });
			expect(serializeToTypst(reread)).toBe(out);
		});
	}
});
