import { expect, it } from 'vitest';
import { visitPathExtent } from '$lib/draw/editor/canvas/drawing/pathExtent';

it("reaches as far as a curve's outline, not its control points", () => {
	const xs: number[] = [];
	const ys: number[] = [];
	// a hump from (0,0) to (10,0) whose control points stand at height 40; the curve itself tops out at 30
	visitPathExtent('M0 0C0 40 10 40 10 0L20 0Z', (x, y) => {
		xs.push(x);
		ys.push(y);
	});
	expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 20, 0, 30]);
});
