// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { menuPoint } from '$lib/editor/visual/contextMenu/menuPoint';
import { createTestCanvasView, settleTestView, LINE, testSchema as s } from '../../canvas/testing/testCanvasView';

async function twoLines() {
	const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('one')]), s.node('paragraph', null, [s.text('two words')])]);
	const view = createTestCanvasView(EditorState.create({ doc }));
	await settleTestView(view);
	return view;
}

// Chromium's contextmenu from Shift+F10 or the Menu key: no button, at the focused element's middle
const fromKeyboard = () => new MouseEvent('contextmenu', { button: -1, clientX: 300, clientY: 200 });

/** within a px of the left of a rect, halfway down */
function expectAtLeftMiddle(point: { x: number; y: number }, rect: DOMRect): void {
	expect(Math.abs(point.x - rect.left)).toBeLessThanOrEqual(1);
	expect(Math.abs(point.y - (rect.top + rect.bottom) / 2)).toBeLessThanOrEqual(1);
}

describe('where a context menu opens', () => {
	it('opens from the keyboard at the caret, as for a DOM selection, and at the pointer for a click', async () => {
		const view = await twoLines();
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8)));
		expectAtLeftMiddle(menuPoint(view, fromKeyboard()), view.canvas.clientRect(view.canvas.geometry.caretRect({ pos: 8, affinity: 1 })!));
		expect(menuPoint(view, new MouseEvent('contextmenu', { button: 2, clientX: 300, clientY: 200 }))).toEqual({ x: 300, y: 200 });
	});

	it('opens from the keyboard at the left of a selection first line', async () => {
		const view = await twoLines();
		const first = { x: 20, y: LINE, width: 40, height: LINE };
		const second = { x: 0, y: 2 * LINE, width: 30, height: LINE };
		Object.assign(view.canvas.geometry, { rangeRects: () => [first, second] });
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7, 13)));
		expectAtLeftMiddle(menuPoint(view, fromKeyboard()), view.canvas.clientRect(first));
	});
});
