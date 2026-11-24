import { describe, expect, it } from 'vitest';
import { BlockHeights, collapsedMargin } from '$lib/editor/canvas/document/blockHeights';

function measure(height: number, marginTop = 0, marginBottom = 0, estimated = false) {
	return { height, marginTop, marginBottom, estimated };
}

describe('block heights', () => {
	it('stack blocks with the margins between them collapsed, the first top margin kept', () => {
		const heights = new BlockHeights();
		heights.reset([measure(30, 8, 12), measure(20, 20, 4), measure(10, -6, 0, true), measure(40)]);
		expect(collapsedMargin(12, 20)).toBe(20);
		expect(collapsedMargin(4, -6)).toBe(-2);
		expect([0, 1, 2, 3].map((i) => heights.top(i).y)).toEqual([8, 58, 76, 86]);
		expect(heights.total).toBe(126);
		expect([heights.top(2).estimated, heights.top(3).estimated]).toEqual([false, true]);
		expect([7, 8, 57, 58, 85, 86, 500].map((y) => heights.indexAt(y))).toEqual([0, 0, 0, 1, 2, 3, 3]);
	});

	it('move only the blocks after a measured one, by how much it changed', () => {
		const heights = new BlockHeights();
		heights.reset([measure(30), measure(24, 0, 0, true), measure(10)]);
		expect(heights.set(1, measure(54, 6, 0))).toBe(36);
		expect([heights.top(0).y, heights.top(1).y, heights.top(2).y]).toEqual([0, 36, 90]);
		expect(heights.top(2).estimated).toBe(false);
	});

	it('move the blocks after one above the pane by whole device pixels, so the reading place holds exactly', () => {
		const heights = new BlockHeights();
		const step = 1 / 1.5;
		heights.reset([measure(24.3, 0, 0, true), measure(24.3, 0, 0, true), measure(30)]);
		expect(heights.set(0, measure(61.81))).toBeCloseTo(37.51, 9);
		const before = heights.top(2).y;
		const moved = heights.set(1, measure(49.13), step);
		expect(moved / step).toBeCloseTo(Math.round(moved / step), 9);
		expect(Math.abs(moved - (49.13 - 24.3))).toBeLessThanOrEqual(step / 2);
		expect(heights.top(2).y - before).toBeCloseTo(moved, 9);
	});
});
