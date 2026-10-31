import { describe, expect, it } from 'vitest';
import { frameResized } from '$lib/draw/editor/state/sheetFrame';

describe('frameResized', () => {
	const frame = { x1: 0, y1: 0, x2: 15, y2: 10 };

	it('sizes on the grid and keeps where the picture starts', () => {
		expect(frameResized(frame, 'xy', [17.3, 11.9], 0.5)).toEqual({ x1: 0, y1: 0, x2: 17.5, y2: 12 });
		expect(frameResized(frame, 'x', [8.2, 40], 0.5)).toEqual({ x1: 0, y1: 0, x2: 8, y2: 10 });
	});

	it('keeps at least a step past the start instead of turning over', () => {
		expect(frameResized(frame, 'xy', [-4, -3], 0.5)).toEqual({ x1: 0, y1: 0, x2: 0.5, y2: 0.5 });
	});
});
