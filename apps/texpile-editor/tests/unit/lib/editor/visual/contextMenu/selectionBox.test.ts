// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { selectionBox } from '$lib/editor/visual/contextMenu/selectionBox';
import { createTestCanvasView, settleTestView, LINE, testSchema as s } from '../../canvas/testing/testCanvasView';

describe('the selected text box Refine opens at', () => {
	it('is the selection on the canvas, which holds no DOM selection', async () => {
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('one')]), s.node('paragraph', null, [s.text('two words')])]);
		const view = createTestCanvasView(EditorState.create({ doc }));
		await settleTestView(view);
		// the test geometry gives text no rects: "two" is given one by hand
		const two = { x: 0, y: LINE, width: 30, height: LINE };
		Object.assign(view.canvas.geometry, { rangeRects: (from: number, to: number) => (from === 6 && to === 9 ? [two] : []) });
		expect(selectionBox(view)).toBeNull();
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6, 9)));
		expect(selectionBox(view)).toEqual(view.canvas.clientRect(two));
	});
});
