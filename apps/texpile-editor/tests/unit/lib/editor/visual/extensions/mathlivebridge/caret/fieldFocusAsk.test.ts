import { expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { FieldFocusAsk } from '$lib/editor/visual/extensions/mathlivebridge/caret/fieldFocusAsk';

// mathlive calls the focus handler once before the focus is there; Down pressed in between moved to the gap below, and
// the real focus then kept the field's caret beside the gap cursor
it("gives back a focus that arrives after the selection moved on, past mathlive's early call", () => {
	const doc = schema.node('doc', null, [
		schema.nodes.block_math.create({ numbered: false, lineLabels: [] }, schema.text('a=b')),
		schema.node('paragraph', null, [schema.text('after')])
	]);
	const view = { state: EditorState.create({ doc, selection: NodeSelection.create(doc, 0) }), focus: vi.fn() };
	const ask = new FieldFocusAsk();
	ask.ask(view as unknown as EditorView);
	expect(ask.late(view as unknown as EditorView, false)).toBe(false);
	view.state = view.state.apply(view.state.tr.setSelection(TextSelection.create(doc, doc.content.size - 1)));
	expect(ask.late(view as unknown as EditorView, true)).toBe(true);
	expect(view.focus).toHaveBeenCalled();
});

// a Down within 60 ms of the field taking the keyboard left it, and mathlive's own timer then took the keyboard back
it('gives back mathlive taking the keyboard again just after the field was left', () => {
	const doc = schema.node('doc', null, [
		schema.nodes.block_math.create({ numbered: false, lineLabels: [] }, schema.text('a=b')),
		schema.node('paragraph', null, [schema.text('after')])
	]);
	const view = { state: EditorState.create({ doc, selection: NodeSelection.create(doc, 0) }), focus: vi.fn() };
	const ask = new FieldFocusAsk();
	ask.ask(view as unknown as EditorView);
	expect(ask.late(view as unknown as EditorView, true)).toBe(false);
	ask.drop();
	view.state = view.state.apply(view.state.tr.setSelection(TextSelection.create(doc, doc.content.size - 1)));
	expect(ask.late(view as unknown as EditorView, true)).toBe(true);
});
