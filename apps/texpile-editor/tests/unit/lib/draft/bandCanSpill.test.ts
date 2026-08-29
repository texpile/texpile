import { describe, expect, it } from 'vitest';
import { bandCanSpill } from '$lib/draft/heuristics/bandCanSpill';

// The decision under test: whose overflow may be rendered by moving content into the next
// slot. Getting the float case wrong does not merely mislabel the render -- it paints the
// float's own caption onto another page and leaves a hole where it was.
describe('bandCanSpill', () => {
	it('renders the motion when column text outgrew its column', () => {
		expect(bandCanSpill({ overflow: true, certFits: false, floatInner: false })).toBe(true);
	});

	it('defers to the engine when it certified the page still fits', () => {
		expect(bandCanSpill({ overflow: true, certFits: true, floatInner: false })).toBe(false);
	});

	it('never spills a band inside a float, which the page builder re-places whole', () => {
		expect(bandCanSpill({ overflow: true, certFits: false, floatInner: true })).toBe(false);
	});

	it('has nothing to move when nothing overflowed', () => {
		expect(bandCanSpill({ overflow: false, certFits: false, floatInner: false })).toBe(false);
	});
});
