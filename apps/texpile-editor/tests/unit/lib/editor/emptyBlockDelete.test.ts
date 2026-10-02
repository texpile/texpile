// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { deleteEmptyBlockForward, deleteEmptyFirstBlock } from '$lib/editor/visual/emptyBlockDelete';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';

function withEmptyFirst(type: 'paragraph' | 'heading') {
	const { doc } = parseLatexFile('\\section{Introduction}\nSome words.\n');
	const schema = doc.type.schema;
	const empty = type === 'heading' ? doc.firstChild!.type.create(doc.firstChild!.attrs) : schema.nodes.paragraph.create();
	const withEmpty = doc.copy(doc.content.addToStart(empty));
	return EditorState.create({ doc: withEmpty, selection: TextSelection.create(withEmpty, 1) });
}

function run(command: typeof deleteEmptyFirstBlock, state: EditorState): EditorState {
	let next = state;
	expect(command(state, (tr: Transaction) => (next = state.apply(tr)))).toBe(true);
	return next;
}

function blocks(state: EditorState): string[] {
	const out: string[] = [];
	state.doc.forEach((n) => out.push(`${n.type.name} ${n.textContent}`));
	return out;
}

describe('an empty block at the start of the document', () => {
	for (const type of ['paragraph', 'heading'] as const) {
		it(`goes with Backspace or Delete when it is a ${type}, and the heading after it stays a heading`, () => {
			for (const command of [deleteEmptyFirstBlock, deleteEmptyBlockForward]) {
				const state = run(command, withEmptyFirst(type));
				expect(blocks(state)).toEqual(['heading Introduction', 'paragraph Some words.']);
				expect(state.selection.from).toBe(1);
			}
		});
	}

	it('stays when it is the only block, and a heading becomes body text', () => {
		const { doc } = parseLatexFile('\\section{}\n');
		const state = run(deleteEmptyFirstBlock, EditorState.create({ doc, selection: TextSelection.create(doc, 1) }));
		expect(blocks(state)).toEqual(['paragraph ']);
		expect(deleteEmptyFirstBlock(state)).toBe(false);
	});
});

describe('a figure whose caption is empty', () => {
	const files: [string, () => import('prosemirror-model').Node][] = [
		[
			'latex',
			() =>
				parseLatexFile('\\begin{figure}[h]\n\\centering\n\\includegraphics{plot.png}\n\\end{figure}\n\nA paragraph after the figure.\n').doc
		],
		['markdown', () => parseMarkdownFile('![](plot.png)\n\nA paragraph after the figure.\n').doc]
	];
	for (const [dialect, parse] of files) {
		it(`stays when Backspace or Delete is pressed in its caption (${dialect})`, () => {
			const doc = parse();
			expect(doc.firstChild!.type.name).toBe('image');
			expect(doc.firstChild!.content.size).toBe(0);
			const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
			expect(deleteEmptyFirstBlock(state)).toBe(false);
			expect(deleteEmptyBlockForward(state)).toBe(false);
		});
	}
});
