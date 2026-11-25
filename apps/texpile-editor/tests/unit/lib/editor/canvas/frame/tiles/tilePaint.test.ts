// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { createTestCanvasView, LINE, settleTestView, testProbe, testSchema } from '../../testing/testCanvasView';

function idleSlices(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 100));
}

describe('the content rows', () => {
	it('repaint the band of the block a key changed, and nothing for a scroll over rows painted ahead', async () => {
		const blocks = Array.from({ length: 80 }, (_, i) => testSchema.node('paragraph', null, [testSchema.text(`line ${i}`)]));
		const view = createTestCanvasView(EditorState.create({ doc: testSchema.node('doc', null, blocks) }), { height: 400 });
		await settleTestView(view);
		const stats = () => testProbe().frameStats();
		const shown = stats().lastPaintedPx;
		expect(shown).toBeGreaterThan(0);
		const third = view.state.doc.resolve(0).posAtIndex(3) + 1;
		view.dispatch(view.state.tr.insertText('!', third));
		await settleTestView(view);
		expect(stats().lastPaintedPx).toBeGreaterThan(0);
		expect(stats().lastPaintedPx).toBeLessThan(shown / 4);
		await idleSlices();
		view.canvas.scroller.scrollTop = 12 * LINE;
		view.canvas.relayout();
		await settleTestView(view);
		expect(stats().lastPaintedPx).toBe(0);
		expect(stats().lateRows).toBe(0);
		view.destroy();
	});
});
