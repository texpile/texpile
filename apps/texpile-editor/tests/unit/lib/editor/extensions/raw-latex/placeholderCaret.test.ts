// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { placeholderCaret } from '$lib/editor/visual/extensions/raw-latex/placeholderCaret';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

describe('a caret moved into a drawn \\maketitle', () => {
	it('takes the block whole, where the face has no text for it', () => {
		const { doc } = parseLatexFile('\\documentclass{article}\n\\title{T}\n\\begin{document}\n\\maketitle\n\nText.\n\\end{document}\n');
		expect(doc.child(0).textContent.trim()).toBe('\\maketitle');
		const state = EditorState.create({ doc, plugins: [placeholderCaret] });
		const next = state.applyTransaction(state.tr.setSelection(TextSelection.create(doc, 1))).state;
		expect(next.selection).toBeInstanceOf(NodeSelection);
		expect(next.selection.from).toBe(0);
	});
});
