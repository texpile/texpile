// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { termKeys } from '$lib/languages/typst/visual/plugins/term/termKeys';

function press(state: EditorState, key: string): { handled: boolean; state: EditorState } {
	let next = state;
	const view = { state, dispatch: (tr: Transaction) => (next = state.apply(tr)) } as unknown as EditorView;
	const handled = termKeys()[0].props.handleKeyDown!.call(termKeys()[0], view, new KeyboardEvent('keydown', { key }));
	return { handled: !!handled, state: next };
}

function stateAt(text: string, where: 'start' | 'end'): EditorState {
	const { doc } = typstToProseMirror('/ Term: Meaning of term.\n/ Other: Other meaning.\n');
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.isText && n.text!.includes(text)) at = pos + (where === 'end' ? n.text!.length : 0);
	});
	return EditorState.create({ doc, selection: Selection.near(doc.resolve(at)) });
}

describe('term keys', () => {
	it('keeps Backspace at the start of a description inside it, and moves Enter from a name into its description', () => {
		const start = press(stateAt('Other meaning.', 'start'), 'Backspace');
		expect(start.handled).toBe(true);
		expect(start.state.selection.$from.parent.textContent).toBe('Other meaning.');

		const middle = stateAt('Other meaning.', 'start');
		const inside = EditorState.create({ doc: middle.doc, selection: TextSelection.create(middle.doc, middle.selection.from + 3) });
		expect(press(inside, 'Backspace').handled).toBe(false);

		const enter = press(stateAt('Term', 'end'), 'Enter');
		expect(enter.handled).toBe(true);
		expect(enter.state.selection.$from.parent.textContent).toBe('Meaning of term.');
	});
});
