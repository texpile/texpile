// @vitest-environment jsdom
// a text drag dropped on the canvas: the words move to the drop point, or stay and are copied there with Ctrl
import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { dropSlice } from '$lib/editor/canvas/interaction/dragDrop/dropSlice';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../testing/testCanvasView';

function dropWords(ctrlKey: boolean): string[] {
	const doc = schema.nodes.doc.create(null, [
		schema.nodes.paragraph.create(null, schema.text('Alpha beta.')),
		schema.nodes.paragraph.create(null, schema.text('Gamma.'))
	]);
	const view = createTestCanvasView(EditorState.create({ doc }));
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)));
	const dragging = { slice: view.state.selection.content(), move: true };
	const event = {
		dataTransfer: { getData: () => '', files: [] },
		ctrlKey,
		altKey: false,
		preventDefault() {}
	} as unknown as DragEvent;
	// after "Gamma", before its period
	dropSlice(view, event, dragging, 19);
	const out: string[] = [];
	view.state.doc.forEach((node) => out.push(node.textContent));
	return out;
}

it('moves the dragged words to the drop point', () => {
	expect(dropWords(false)).toEqual(['beta.', 'GammaAlpha .']);
});

it('copies them there with Ctrl held', () => {
	expect(dropWords(true)).toEqual(['Alpha beta.', 'GammaAlpha .']);
});
