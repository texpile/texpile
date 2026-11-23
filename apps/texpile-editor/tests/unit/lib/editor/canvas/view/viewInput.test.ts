// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView, settleTestView } from '../testing/testCanvasView';

const { paragraph, inline_math: inlineMath } = schema.nodes;

describe('typed text before the next frame', () => {
	it('lands at the selection a press or a paste just set, and leaves a formula selected before it alone', async () => {
		const doc = schema.nodes.doc.create(null, [
			paragraph.create(null, [schema.text('alpha '), inlineMath.create(null, schema.text('x^2')), schema.text(' beta')])
		]);
		const formula = 'alpha '.length + 1;
		const view = createTestCanvasView(EditorState.create({ doc, selection: NodeSelection.create(doc, formula) }));
		view.focus();
		await settleTestView(view);
		const input = view.dom.querySelector<HTMLTextAreaElement>('[data-canvas-input]')!;
		// the surface still holds the selected formula as its selection
		const end = view.state.doc.content.size - 1;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
		input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'Q', cancelable: true }));
		expect(view.state.doc.textContent).toBe('alpha x^2 betaQ');
		view.destroy();
	});

	it('is refused by a view that is not editable', async () => {
		const doc = schema.nodes.doc.create(null, [paragraph.create(null, schema.text('alpha'))]);
		const view = createTestCanvasView(EditorState.create({ doc, selection: TextSelection.create(doc, 3) }));
		view.setProps({ editable: () => false });
		view.focus();
		await settleTestView(view);
		const input = view.dom.querySelector<HTMLTextAreaElement>('[data-canvas-input]')!;
		input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'Q', cancelable: true }));
		input.dispatchEvent(new CompositionEvent('compositionstart'));
		input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'に' }));
		expect(view.state.doc.textContent).toBe('alpha');
		view.destroy();
	});
});
