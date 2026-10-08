import { describe, expect, it } from 'vitest';
import { trackSizes, movedDivider, revealShift, MIN_COLUMN_PX, trackSpan, trackTemplate } from '$lib/workspace/groups/groupSizes';

describe('trackSizes', () => {
	it('fills the room in whole pixels', () => {
		const sizes = trackSizes([1, 1, 1], 1201, MIN_COLUMN_PX);
		expect(sizes.every(Number.isInteger)).toBe(true);
		expect(sizes.reduce((a, b) => a + b)).toBe(1201);
	});

	it('keeps every track at the minimum and overflows instead of squeezing', () => {
		expect(trackSizes([0.1, 0.9], 1000, MIN_COLUMN_PX)).toEqual([MIN_COLUMN_PX, 1000 - MIN_COLUMN_PX]);
		expect(trackSizes([1, 1], 600, MIN_COLUMN_PX)).toEqual([MIN_COLUMN_PX, MIN_COLUMN_PX]);
	});
});

describe('movedDivider', () => {
	it('stops at the minimum on either side', () => {
		expect(movedDivider([500, 500], 0, -400, MIN_COLUMN_PX)).toEqual([MIN_COLUMN_PX, 1000 - MIN_COLUMN_PX]);
		expect(movedDivider([500, 500], 0, 400, MIN_COLUMN_PX)).toEqual([1000 - MIN_COLUMN_PX, MIN_COLUMN_PX]);
	});
});

describe('revealShift', () => {
	it('scrolls a slot past the far edge just into view, and leaves one in view alone', () => {
		expect(revealShift(361, 360, 510)).toBe(211);
		expect(revealShift(0, 360, 510)).toBe(0);
	});

	it('brings the start of a slot wider than the view, or one before it, to the edge', () => {
		expect(revealShift(361, 360, 300)).toBe(361);
		expect(revealShift(-120, 360, 510)).toBe(-120);
	});
});

describe('trackTemplate', () => {
	// pinned to last frame's pixels, a narrower area overflowed for a frame, showed scrollbars and moved every divider
	it('holds the last track to its minimum only, so the grid shrinks with its area', () => {
		expect(trackTemplate([400, 300], 240)).toBe('400px 1px minmax(240px, 1fr)');
		expect(trackTemplate([700], 360)).toBe('minmax(0px, 1fr)');
		expect([trackSpan([400, 300], 240), trackSpan([700], 360)]).toEqual([641, 0]);
	});
});
