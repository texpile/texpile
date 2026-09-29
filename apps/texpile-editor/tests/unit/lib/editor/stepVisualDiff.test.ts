// Previous and next change in a visual comparison. A deleted paragraph's mark sits between blocks,
// so the caret lands just inside the block after it: stepping has to go by where the caret lands,
// or Previous sends it back to the same deleted paragraph on every press.
import { it, expect } from 'vitest';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { visualDiffPlugin } from '$lib/editor/visual/diff/visualDiffPlugin';
import { changeRanges, stepVisualDiff } from '$lib/editor/visual/diff/stepVisualDiff';

const doc = (body: string) => parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`).doc;

function fakeView(version: string, working: string) {
	const view = {
		state: EditorState.create({ schema, doc: doc(working), plugins: [visualDiffPlugin({ oldDoc: doc(version) })] }),
		dispatch(tr: Transaction) {
			view.state = view.state.apply(tr);
		},
		focus() {}
	};
	return view;
}

it('steps both ways past a deleted paragraph, wrapping round', () => {
	const view = fakeView('Kept one.\n\nGone entirely.\n\nKept two.\n\nThe end.', 'Kept one.\n\nKept two.\n\nThe end, changed.');
	const pm = view as unknown as EditorView;
	expect(changeRanges(pm).length).toBe(2);

	const heads = (dir: 1 | -1, n: number) =>
		Array.from({ length: n }, () => {
			stepVisualDiff(pm, dir);
			return view.state.selection.head;
		});
	const forward = heads(1, 4);
	expect(new Set(forward).size).toBe(2); // visits both changes, then wraps
	const back = heads(-1, 4);
	expect(new Set(back).size).toBe(2);
	expect(back[0]).not.toBe(back[1]);
});
