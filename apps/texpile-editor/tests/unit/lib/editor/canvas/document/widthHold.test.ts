// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { createTestCanvasView, LINE, lineLayout, setTestColumnWidth, settleTestView, testSchema } from '../testing/testCanvasView';

describe('the width hold', () => {
	it('lays blocks out at the old width while a divider drags and at the new one on release', async () => {
		const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, [testSchema.text('one')])]);
		const widths: number[] = [];
		const view = createTestCanvasView(EditorState.create({ doc }), {
			width: 600,
			engine: {
				layoutBlock(request) {
					widths.push(request.width);
					return lineLayout(request, LINE, null);
				}
			}
		});
		await settleTestView(view);
		view.canvas.holdWidth();
		setTestColumnWidth(view, 400);
		view.canvas.relayout();
		await settleTestView(view);
		expect(widths).toEqual([600]);
		view.canvas.releaseWidth();
		await settleTestView(view);
		expect(widths).toEqual([600, 400]);
		view.destroy();
	});
});
