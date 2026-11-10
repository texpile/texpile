// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { lineEdgeKeys } from '$lib/editor/visual/lineEdgeArrows';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { doc } = parseLatexFile(
	'\\documentclass{article}\n\\begin{document}\nBefore.\n\\begin{equation}\na=b\n\\end{equation}\nAfter.\n\\end{document}\n'
);

function pressCmdArrow(key: 'ArrowLeft' | 'ArrowRight', caret: number) {
	const view = new EditorView(document.createElement('div'), {
		state: EditorState.create({ doc, selection: TextSelection.create(doc, caret), plugins: [keymap(lineEdgeKeys)] })
	});
	view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: key === 'ArrowLeft' ? 37 : 39, metaKey: true, bubbles: true }));
	return view.state.selection;
}

describe('Cmd+Left and Cmd+Right at a text block edge beside an equation', () => {
	it('keep the caret at the end of the line', () => {
		const end = doc.firstChild!.nodeSize - 1;
		const sel = pressCmdArrow('ArrowRight', end);
		expect(sel).toBeInstanceOf(TextSelection);
		expect(sel.head).toBe(end);
	});

	it('keep the caret at the start of the line', () => {
		const start = doc.content.size - doc.lastChild!.nodeSize + 1;
		const sel = pressCmdArrow('ArrowLeft', start);
		expect(sel).toBeInstanceOf(TextSelection);
		expect(sel.head).toBe(start);
	});
});
