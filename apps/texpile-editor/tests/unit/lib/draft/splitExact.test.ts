import { describe, expect, it } from 'vitest';
import { splitExact } from '$lib/draft/heuristics/splitExact';
import type { Cal } from '$lib/draft/locate/locate.types';

// The decision under test: when may a straddling paragraph's two-column splice claim to be
// what a recompile produces. Every clause has to be able to say no on its own, because each
// one is a different way for content below a fragment to move.
const CAL: Cal = {
	pageNo: 3,
	b1: 500,
	bk: 524,
	medGap: 12,
	paraLeft: 0,
	W: 345,
	colL: 62,
	colR: 407,
	splitAt: 3,
	spill: { b1: 80, bk: 104, colL: 62, colR: 407, paraLeft: 0, pageNo: 4, h1: 7 }
};
const HELD = { kA: 3, aSpan: 24, spillDelta: 0, bH1: 7 };
const TOPSKIP = 10;

describe('splitExact', () => {
	it('holds when the engine put the break back on the page’s own line', () => {
		expect(splitExact(CAL, TOPSKIP, HELD)).toBe(true);
	});

	it('refuses a break that migrated, even by one line', () => {
		expect(splitExact(CAL, TOPSKIP, { ...HELD, kA: 4 })).toBe(false);
	});

	it('refuses when either fragment changed height', () => {
		expect(splitExact(CAL, TOPSKIP, { ...HELD, aSpan: 36 })).toBe(false);
		expect(splitExact(CAL, TOPSKIP, { ...HELD, spillDelta: 12 })).toBe(false);
	});

	it('refuses a spill whose first line grew past \\topskip, which seats it lower', () => {
		// under \topskip both heights vanish into the same landing, so only a box TALLER than
		// it moves the receiving column's first baseline
		expect(splitExact(CAL, TOPSKIP, { ...HELD, bH1: 9 })).toBe(true);
		expect(splitExact(CAL, TOPSKIP, { ...HELD, bH1: 14 })).toBe(false);
	});

	it('refuses a split the search tiers found, whose break is their own answer', () => {
		const searched: Cal = { ...CAL, splitAt: undefined, approx: true };
		expect(splitExact(searched, TOPSKIP, HELD)).toBe(false);
		// stated break, but the band stands at stretched spacing: placement-true, respaced
		expect(splitExact({ ...CAL, approx: true, approxStretch: true }, TOPSKIP, HELD)).toBe(false);
	});
});
