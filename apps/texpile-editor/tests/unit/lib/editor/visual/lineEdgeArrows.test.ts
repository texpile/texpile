// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { lineEdgeKeys } from '$lib/editor/visual/lineEdgeArrows';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { createTestCanvasView, settleTestView } from '../canvas/testing/testCanvasView';

const { doc } = parseLatexFile(
	'\\documentclass{article}\n\\begin{document}\nBefore.\n\\begin{equation}\na=b\n\\end{equation}\nAfter.\n\\end{document}\n'
);

async function pressCmdArrow(key: 'ArrowLeft' | 'ArrowRight', caret: number) {
	const view = createTestCanvasView(
		EditorState.create({ doc, selection: TextSelection.create(doc, caret), plugins: [keymap(lineEdgeKeys)] })
	);
	await settleTestView(view);
	view.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: key === 'ArrowLeft' ? 37 : 39, metaKey: true }));
	const { selection } = view.state;
	view.destroy();
	return selection;
}

describe('Cmd+Left and Cmd+Right at a text block edge beside an equation', () => {
	it('keep the caret at the end of the line', async () => {
		const end = doc.firstChild!.nodeSize - 1;
		const sel = await pressCmdArrow('ArrowRight', end);
		expect(sel).toBeInstanceOf(TextSelection);
		expect(sel.head).toBe(end);
	});

	it('keep the caret at the start of the line', async () => {
		const start = doc.content.size - doc.lastChild!.nodeSize + 1;
		const sel = await pressCmdArrow('ArrowLeft', start);
		expect(sel).toBeInstanceOf(TextSelection);
		expect(sel.head).toBe(start);
	});
});
