// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { createTestCanvasView, settleTestView, GUTTER, LINE, testSchema as s } from '../testing/testCanvasView';

function threeParagraphs() {
	const doc = s.node(
		'doc',
		null,
		['one', 'two', 'three'].map((text) => s.node('paragraph', null, [s.text(text)]))
	);
	return createTestCanvasView(EditorState.create({ doc }));
}

describe('overlay anchors', () => {
	it('stand on their node through edits before it, and keep the last rect for a popover once it is deleted', async () => {
		const view = threeParagraphs();
		await settleTestView(view);
		const anchor = view.canvas.anchors.node(5);
		expect(anchor.clientRect()).toMatchObject({ x: GUTTER, y: LINE, height: LINE });
		view.dispatch(view.state.tr.insert(0, s.node('paragraph', null, [s.text('zero')])));
		await settleTestView(view);
		expect(anchor.docRect()).toMatchObject({ y: 2 * LINE });
		const reference = anchor.virtual();
		const last = reference.getBoundingClientRect();
		view.dispatch(view.state.tr.delete(11, 16));
		await settleTestView(view);
		expect(anchor.docRect()).toBeNull();
		expect(reference.getBoundingClientRect()).toEqual(last);
		expect(reference.contextElement).toBe(view.dom);
	});

	it('are out of sight once the pane scrolls them away', async () => {
		const view = threeParagraphs();
		await settleTestView(view);
		const anchor = view.canvas.anchors.node(0);
		expect(anchor.visible()).toBe(true);
		view.canvas.scroller.scrollTop = 1000;
		expect(anchor.visible()).toBe(false);
	});
});
