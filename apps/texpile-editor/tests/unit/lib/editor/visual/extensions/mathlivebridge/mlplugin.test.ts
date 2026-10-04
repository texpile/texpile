// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
vi.mock('$lib/editor/visual/extensions/mathlivebridge/mlview.svelte', () => ({ MathLiveView: class {} }));

import { mlarrowHandlers } from '$lib/editor/visual/extensions/mathlivebridge/mlplugin';

// "The variable $x$ is not zero." with the math at 14..17
function sentence(anchor: number, head = anchor) {
	const p = schema.node('paragraph', null, [
		schema.text('The variable '),
		schema.node('inline_math', null, [schema.text('x')]),
		schema.text(' is not zero.')
	]);
	const doc = schema.node('doc', null, [p]);
	return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) });
}

function press(state: EditorState, key: string, shiftKey: boolean) {
	let next = state;
	const view = {
		get state() {
			return next;
		},
		dispatch: (tr: Transaction) => (next = next.apply(tr))
	} as unknown as EditorView;
	const handled = mlarrowHandlers.props.handleKeyDown!.call(mlarrowHandlers, view, new KeyboardEvent('keydown', { key, shiftKey }));
	return { handled, state: next };
}

describe('mlarrowHandlers', () => {
	it('extends a selection over inline math with shift right', () => {
		const { handled, state } = press(sentence(1, 14), 'ArrowRight', true);
		expect(handled).toBe(true);
		expect(state.selection).toBeInstanceOf(TextSelection);
		expect([state.selection.anchor, state.selection.head]).toEqual([1, 17]);
	});

	it('extends a selection over inline math with shift left', () => {
		const { handled, state } = press(sentence(25, 17), 'ArrowLeft', true);
		expect(handled).toBe(true);
		expect(state.selection).toBeInstanceOf(TextSelection);
		expect([state.selection.anchor, state.selection.head]).toEqual([25, 14]);
	});

	it('still enters the math on a plain arrow', () => {
		const { state } = press(sentence(14), 'ArrowRight', false);
		expect(state.selection).toBeInstanceOf(NodeSelection);
		expect(state.selection.from).toBe(14);
	});
});
