/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { packsToGoal } from '$lib/draft/heuristics/packsToGoal';

// The decision under test: which pages a capacity split may speak for. Record shapes are
// the engine's own, measured from the BERT fixture -- pages 16-17 (packed to the goal)
// carry finite-order glue set off natural and no body fil; page 18 (the last, ragged one)
// carries no finite-order stretch and two body fils that swallowed the slack. Every page
// also carries fil glue ABOVE the body origin, which must not count.
const vg = (y: number, w: number, nw: number, sto = 0) => ({ t: 'vg', x: 0, y, w, nw, st: 1, sto, sh: 0, sho: 0 });
const headFil = vg(-24.3, 300, 0, 2);

describe('packsToGoal', () => {
	it('a filled page: finite-order glue set off natural, no fil in the body', () => {
		expect(packsToGoal([headFil, vg(120, 12.5677, 12), vg(300, 4.5, 4)] as any)).toBe(true);
	});

	it('the last page: a body fil swallowed the slack, so nothing is packed to the goal', () => {
		// the exact trap the old predicate fell into -- these fils ARE glue set off natural,
		// so any "was some glue stretched" test calls this page filled
		expect(packsToGoal([headFil, vg(137.77, 555.78, 0, 2), vg(1.77, 691.78, 0, 2)] as any)).toBe(false);
	});

	it('a body fil disqualifies the page even next to finite-order stretch', () => {
		expect(packsToGoal([vg(120, 12.5677, 12), vg(400, 200, 0, 2)] as any)).toBe(false);
	});

	it('no stretch anywhere: no evidence the engine filled anything', () => {
		expect(packsToGoal([headFil, vg(120, 12, 12)] as any)).toBe(false);
	});
});
