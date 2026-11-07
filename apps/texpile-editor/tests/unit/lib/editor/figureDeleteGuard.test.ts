// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { baseKeymap } from 'prosemirror-commands';
import { listKeymap } from 'prosemirror-flat-list';
import type { Node } from 'prosemirror-model';
import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseMarkdownFile, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

// what the editors bind: the guard first, then the list keymap, then ProseMirror's own key
function backspace(doc: Node, pos: number): EditorState {
	let state = EditorState.create({ doc, selection: TextSelection.near(doc.resolve(pos)) });
	const dispatch = (tr: import('prosemirror-state').Transaction) => (state = state.apply(tr));
	if (!selectFigureBackward(state, dispatch) && !listKeymap.Backspace(state, dispatch)) baseKeymap.Backspace(state, dispatch);
	return state;
}
function del(doc: Node, pos: number): EditorState {
	let state = EditorState.create({ doc, selection: TextSelection.near(doc.resolve(pos), 1) });
	const dispatch = (tr: import('prosemirror-state').Transaction) => (state = state.apply(tr));
	if (!selectFigureForward(state, dispatch) && !listKeymap.Delete(state, dispatch)) baseKeymap.Delete(state, dispatch);
	return state;
}
function startOf(doc: Node, needle: string): number {
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.isTextblock && n.textContent.startsWith(needle)) at = pos + 1;
		return at < 0;
	});
	return at;
}
function endOf(doc: Node, needle: string): number {
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.isTextblock && n.textContent.startsWith(needle)) at = pos + 1 + n.content.size;
		return at < 0;
	});
	return at;
}

describe('Backspace after a figure and Delete before one select the figure instead of eating it', () => {
	const cases = [
		{
			name: 'latex',
			src: '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nBefore.\n\n\\begin{figure}[h]\n\\centering\n\\includegraphics[width=100pt]{plot.png}\n\\caption{A caption.}\n\\end{figure}\n\nAfter the figure.\n\\end{document}\n',
			parse: parseLatexFile,
			serialize: serializeLatexFile,
			keeps: '\\includegraphics[width=100pt]{plot.png}'
		},
		{
			name: 'markdown',
			src: 'Before.\n\n![A generated plate](images/plate.png)\n\nAfter the figure.\n',
			parse: parseMarkdownFile,
			serialize: serializeMarkdownFile,
			keeps: '![A generated plate](images/plate.png)'
		},
		{
			name: 'typst',
			src: 'Before.\n\n#figure(\n  image("plot.png", width: 80%),\n  caption: [A caption.],\n)\n\nAfter the figure.\n',
			parse: parseTypstFile,
			serialize: serializeTypstFile,
			keeps: 'image("plot.png", width: 80%)'
		}
	] as const;

	for (const c of cases) {
		it(`${c.name}: Backspace at the start of the paragraph after the figure`, () => {
			const parsed = c.parse(c.src);
			const state = backspace(parsed.doc, startOf(parsed.doc, 'After'));
			expect(state.selection).toBeInstanceOf(NodeSelection);
			expect((state.selection as NodeSelection).node.type.name).toBe('image');
			expect(state.doc.eq(parsed.doc)).toBe(true);
			expect(c.serialize(parsed, state.doc)).toBe(c.src);
		});

		it(`${c.name}: Delete at the end of the paragraph before the figure`, () => {
			const parsed = c.parse(c.src);
			const state = del(parsed.doc, endOf(parsed.doc, 'Before'));
			expect(state.selection).toBeInstanceOf(NodeSelection);
			expect(state.doc.eq(parsed.doc)).toBe(true);
		});

		it(`${c.name}: a second Backspace then deletes the selected figure, on purpose`, () => {
			const parsed = c.parse(c.src);
			const first = backspace(parsed.doc, startOf(parsed.doc, 'After'));
			let state = first;
			baseKeymap.Backspace(state, (tr) => (state = state.apply(tr)));
			expect(c.serialize(parsed, state.doc)).not.toContain(c.keeps);
			expect(state.doc.textContent).toContain('After the figure.');
		});
	}
});

const LATEX = (body: string) =>
	`\\documentclass{article}\n\\usepackage{amsmath,algorithm,algpseudocode}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe('Backspace and Delete beside code or a caption go into it instead of joining text into it', () => {
	const cases = [
		{ name: 'latex equation', src: LATEX('Before.\n\n\\begin{equation}\nx = y\n\\end{equation}\n\nAfter.'), parse: parseLatexFile },
		{ name: 'latex display', src: LATEX('Before.\n\n\\[ z = w \\]\n\nAfter.'), parse: parseLatexFile },
		{ name: 'latex verbatim', src: LATEX('Before.\n\n\\begin{verbatim}\ncode line\n\\end{verbatim}\n\nAfter.'), parse: parseLatexFile },
		{
			name: 'latex algorithm',
			src: LATEX(
				'Before.\n\n\\begin{algorithm}\n\\caption{Alg}\n\\begin{algorithmic}\n\\State $x \\gets 1$\n\\end{algorithmic}\n\\end{algorithm}\n\n\\section{After}'
			),
			parse: parseLatexFile
		},
		{ name: 'typst equation', src: 'Before.\n\n$ x = y $\n\nAfter.\n', parse: parseTypstFile },
		{
			name: 'typst figure code',
			src: 'Before.\n\n#figure(\n  rect(width: 3cm, height: 1cm),\n  caption: [Cap],\n)\n\nAfter.\n',
			parse: parseTypstFile
		}
	] as const;

	for (const c of cases) {
		it(`${c.name}: Backspace at the start of the block after it`, () => {
			const { doc } = c.parse(c.src);
			const at = startOf(doc, 'After');
			const state = backspace(doc, at);
			expect(state.doc.eq(doc)).toBe(true);
			expect(state.selection.from).toBeLessThan(at - 1);
		});
		it(`${c.name}: Delete at the end of the block before it`, () => {
			const { doc } = c.parse(c.src);
			const at = endOf(doc, 'Before');
			const state = del(doc, at);
			expect(state.doc.eq(doc)).toBe(true);
			expect(state.selection.to).toBeGreaterThan(at + 1);
		});
	}

	it('Backspace on an empty line after an equation takes the line and selects the equation', () => {
		const { doc } = parseLatexFile(LATEX('\\begin{equation}\nx = y\n\\end{equation}\n\nAfter.'));
		let state = EditorState.create({ doc });
		state = state.apply(state.tr.insert(doc.child(0).nodeSize, state.schema.nodes.paragraph.create()));
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, doc.child(0).nodeSize + 1)));
		selectFigureBackward(state, (tr) => (state = state.apply(tr)));
		expect(state.doc.eq(doc)).toBe(true);
		expect((state.selection as NodeSelection).node.type.name).toBe('block_math');
	});

	it('Delete at the end of a caption keeps the paragraph after the figure out of it', () => {
		const typst = parseTypstFile('#figure(\n  rect(width: 3cm),\n  caption: [Cap],\n)\n\nAfter.\n').doc;
		expect(del(typst, endOf(typst, 'Cap')).doc.eq(typst)).toBe(true);
		const latex = parseLatexFile(LATEX('\\begin{figure}\n\\includegraphics{a.png}\n\\caption{Cap}\n\\end{figure}\n\nAfter.')).doc;
		expect(del(latex, endOf(latex, 'Cap')).doc.eq(latex)).toBe(true);
	});
});
