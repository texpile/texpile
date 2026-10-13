// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
vi.mock('$lib/editor/visual/extensions/mathlivebridge/mlview.svelte', () => ({ MathLiveView: class {} }));

import { mlarrowHandlers, mathlivePlugin } from '$lib/editor/visual/extensions/mathlivebridge/mlplugin';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';

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

describe('a caret left in an equation by the browser (End after a trailing equation)', () => {
	// "More text.$y$": the equation at 11, its text at 12..13, the paragraph's end at 14
	const trailing = () => {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.text('More text.'), schema.node('inline_math', null, [schema.text('y')])])
		]);
		return EditorState.create({ doc, plugins: [mathlivePlugin] });
	};

	it('goes beside the equation, so typing lands in the paragraph', () => {
		const state = trailing();
		const after = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 13)));
		expect(after.selection.from).toBe(14);
		expect(after.selection.$from.parent.type.name).toBe('paragraph');
	});

	it('Ctrl+M there declines instead of throwing', () => {
		const state = EditorState.create({ doc: trailing().doc, selection: TextSelection.create(trailing().doc, 13) });
		expect(createMathField()(state, () => {})).toBe(false);
	});
});
