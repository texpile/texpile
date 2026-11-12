// @vitest-environment jsdom
// Insert > TikZ figure and CeTZ figure: the picture goes in once with the package or import it needs, and the tab opens on it
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState as CMState } from '@codemirror/state';
import { EditorView as CMView } from '@codemirror/view';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { editorViewStore, sourceCmView, viewMode } from '$lib/stores/editorStore';
import { makeInsertHandlers } from '$lib/chrome/menubar/insert/menuBarInsert';
import { newPictureStart } from '$lib/chrome/menubar/insert/menuBarInsertFigure';

// jsdom has no layout; coordsAtPos only needs rects that exist
if (!Range.prototype.getClientRects) {
	Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
	Range.prototype.getBoundingClientRect = () => new DOMRect();
}

afterEach(() => {
	editorViewStore.current?.destroy();
	editorViewStore.current = null;
	sourceCmView.current?.destroy();
	sourceCmView.current = null;
	viewMode.current = 'visual';
});

describe('Insert > TikZ figure in a LaTeX file', () => {
	const { insertSelect } = makeInsertHandlers({ dialect: () => 'tex', askText: async () => null, pickImage: () => {} });

	it('writes an empty picture on lines of its own and loads tikz once', async () => {
		const text = '\\documentclass{article}\n\\begin{document}\nWords.\n\\end{document}\n';
		sourceCmView.current = new CMView({ state: CMState.create({ doc: text }), parent: document.body });
		sourceCmView.current.dispatch({ selection: { anchor: text.indexOf('Words.') + 3 } });
		viewMode.current = 'source';
		await insertSelect('figure');
		await insertSelect('figure');
		const out = sourceCmView.current.state.doc.toString();
		expect(out.match(/\\usepackage\{tikz\}/g)).toHaveLength(1);
		expect(out.match(/\\begin\{tikzpicture\}/g)).toHaveLength(2);
		expect(out).toMatch(/Words\.\n\\begin\{tikzpicture\}[\s\S]*\\end\{tikzpicture\}\n/);
	});
});

describe('Insert > CeTZ figure in a Typst file', () => {
	const { insertSelect } = makeInsertHandlers({ dialect: () => 'typ', askText: async () => null, pickImage: () => {} });

	it('puts a canvas after the paragraph and imports cetz once', async () => {
		const doc = typSchema.nodes.doc.create(null, [typSchema.nodes.paragraph.create(null, typSchema.text('Intro text.'))]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
		editorViewStore.current = view;
		await insertSelect('figure');
		await insertSelect('figure');
		const blocks: string[] = [];
		view.state.doc.forEach((node) => blocks.push(node.textContent));
		const out = blocks.join('\n\n');
		expect(out.match(/@preview\/cetz:/g)).toHaveLength(1);
		expect(out.match(/#canvas\(/g)).toHaveLength(2);
		expect(out.indexOf('#import')).toBeLessThan(out.indexOf('Intro text.'));
	});

	it('does not import cetz again under another version', async () => {
		const imported = '#import "@preview/cetz:0.3.0": canvas, draw\n\nWords.\n';
		sourceCmView.current = new CMView({ state: CMState.create({ doc: imported }), parent: document.body });
		sourceCmView.current.dispatch({ selection: { anchor: imported.length } });
		viewMode.current = 'source';
		await insertSelect('figure');
		const out = sourceCmView.current.state.doc.toString();
		expect(out.match(/@preview\/cetz:/g)).toHaveLength(1);
		expect(out).toContain('#canvas(');
	});
});

describe('the picture a figure tab opens on', () => {
	it('is the new one when the same change also added the package above an older picture', () => {
		const old = '\\begin{tikzpicture}\n\\end{tikzpicture}';
		const before = `\\documentclass{article}\n\\begin{document}\n${old}\n\nWords.\n\\end{document}\n`;
		const added = '\\begin{tikzpicture}\n  \\useasboundingbox (0,0) rectangle (15,10);\n\\end{tikzpicture}';
		const after = before.replace('\\begin{document}', '\\usepackage{tikz}\n\\begin{document}').replace('Words.\n', `Words.\n${added}\n`);
		expect(newPictureStart('main.tex', before, after)).toBe(after.indexOf(added));
	});
});
