import { describe, expect, it } from 'vitest';
import { buildPageSkeleton, spliceBandSkeleton } from '$lib/draft/heuristics/pageSkeleton';
import type { PageRecord } from '$lib/draft/geometry/geometry.types';

// The decisions under test: what becomes a skeleton item, the rigid remainder of each
// gap, and when the builder must refuse rather than lie.
const pl = (y: number, h = 8, d = 3, x = 10, w = 200) => ({ t: 'pl', x, y, w, h, d });
const vg = (y: number, w: number, nw: number, st: number, x = 10) => ({ t: 'vg', x, y, w, nw, st, sto: 0, sh: 0, sho: 0 });
const pen = (y: number, p: number) => ({ t: 'pen', y, p });

describe('buildPageSkeleton float boxes', () => {
	// engine record shapes from a [t] table float above two body paragraphs: the float's
	// caption and tabular emit pl records indistinguishable from galley text, and only the
	// vbox marker says the engine pins them as a unit
	const pl = (y: number) => ({ t: 'pl', x: 0, y, w: 229.5, h: 7, d: 2 });
	const body = [pl(70), pl(82), pl(94), pl(151), pl(163), pl(175)];
	// the real shape: a container's recorded depth stops at its LAST BASELINE, so its last
	// line's descender hangs below the box it is inside (measured, twocol fixture page 1)
	const container = { t: 'vbox', x: 0, y: 175, w: 229.5, h: 122, d: 0 };

	it('a box holding PART of the column refuses it: those lines are not galley', () => {
		const float = { t: 'vbox', x: 0, y: 100, w: 229.5, h: 40, d: 0 };
		expect(buildPageSkeleton([...body, float, container] as PageRecord[], -10, 240)).toBeNull();
	});

	it('the column container holds every line and is not a float', () => {
		expect(buildPageSkeleton([...body, container] as PageRecord[], -10, 240)).not.toBeNull();
	});

	it('a box in another column is not this column’s problem', () => {
		const other = { t: 'vbox', x: 300, y: 100, w: 229.5, h: 40, d: 0 };
		expect(buildPageSkeleton([...body, other, container] as PageRecord[], -10, 240)).not.toBeNull();
	});
});

describe('buildPageSkeleton', () => {
	it('boxes, penalties, stretchables and the rigid remainder, in list order', () => {
		// gap between lines: 115-8-(100+3) = 4pt; vg effective 1.5 -> rigid 2.5 at natural nw
		const skel = buildPageSkeleton([pl(100), pen(103, 150), vg(103, 1.5, 1.0, 0.5), pl(115), pl(130)], -5, 220)!;
		expect(skel.boxYs).toEqual([100, 115, 130]);
		expect(skel.target).toBeCloseTo(130 - 92, 4);
		const kinds = skel.items.map((i) => i.t).join('');
		expect(kinds).toBe('bpggbgb');
		const glue = skel.items.filter((i) => i.t === 'g') as { w: number }[];
		expect(glue[0].w).toBeCloseTo(1.0, 4); // NATURAL width, not effective
		expect(glue[1].w).toBeCloseTo(2.5, 4); // rigid remainder
	});

	it('nested lines (a minipage inside a line) never become galley boxes', () => {
		const skel = buildPageSkeleton([pl(100, 20, 10), pl(95, 4, 2), pl(130)], -5, 220)!;
		expect(skel.boxYs).toEqual([100, 130]);
	});

	it('refuses footnotes, floats and unexplained negative gaps', () => {
		expect(buildPageSkeleton([pl(100), { t: 'note', cls: 0, h: 10 }, pl(115)], -5, 220)).toBeNull();
		expect(buildPageSkeleton([pl(100), { t: 'image', x: 10, y: 108, w: 50, h: 4, d: 0 }, pl(115)], -5, 220)).toBeNull();
		// a rule BETWEEN lines is structure (footnote rule); inside a line's span it is content
		expect(buildPageSkeleton([pl(100), { t: 'rule', x: 10, y: 105, w: 50, h: 0.4, d: 0 }, pl(115)], -5, 220)).toBeNull();
		expect(buildPageSkeleton([pl(100), { t: 'rule', x: 10, y: 99, w: 50, h: 0.4, d: 0 }, pl(115)], -5, 220)).not.toBeNull();
		// invisible rules between lines are tolerated: a zero-width strut and a 0pt footrule
		expect(buildPageSkeleton([pl(100), { t: 'rule', x: 10, y: 111, w: 0, h: 7.7, d: 0 }, pl(115)], -5, 220)).not.toBeNull();
		expect(buildPageSkeleton([pl(100), { t: 'rule', x: 10, y: 105, w: 200, h: 0, d: 0 }, pl(115)], -5, 220)).not.toBeNull();
		// lines closer than their boxes allow = a kern pulled them together
		expect(buildPageSkeleton([pl(100), pl(108)], -5, 220)).toBeNull();
	});

	it('splices a daemon band and reports its box count', () => {
		const skel = buildPageSkeleton([pl(100), pl(115), pl(130)], -5, 220)!;
		const daemonRecs = [
			{ t: 'line', y: 8, h: 8, d: 3 },
			{ t: 'pen', y: 11, p: 150 },
			{ t: 'line', y: 23, h: 8, d: 3 }
		];
		const s = spliceBandSkeleton(skel, 1, 1, daemonRecs)!;
		expect(s.bandBoxes).toBe(2);
		// 3 boxes -> band of 2 replaces the middle: 4 boxes total
		expect(s.items.filter((i) => i.t === 'b')).toHaveLength(4);
	});
});
