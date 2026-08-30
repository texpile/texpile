import { describe, expect, it } from 'vitest';
import { buildPageSkeleton } from '$lib/draft/heuristics/pageSkeleton';
import type { PageRecord } from '$lib/draft/geometry/geometry.types';

// The decision under test: which of a column's lines are GALLEY -- the vertical list the page
// builder actually broke. Measured on the BERT fixture, page 5 column 1: a figure* above both
// columns puts its graphic and a two-line caption at the left margin (inside the column's
// horizontal window, above its box), and a footnote sits at the bottom INSIDE that box. The
// walker stamps every line \box255 held with its output firing, and pre_output_filter sees
// the galley alone, so the stamp separates all of it and no position test can.
const gal = (y: number, w = 219, h = 8): PageRecord => ({ t: 'pl', x: 0, y, w, h, d: 3, c: 16 }) as PageRecord;
const bare = (y: number, w = 219, h = 8): PageRecord => ({ t: 'pl', x: 0, y, w, h, d: 3 }) as PageRecord;

describe('page skeleton galley stamp', () => {
	const body = [gal(167), gal(180), gal(194), gal(208)];

	it('leaves out a footnote sitting inside the column box', () => {
		// below the last galley line, above the column bottom: the one case a vertical bound
		// on the column box cannot exclude, because the engine really does put it in there
		const skel = buildPageSkeleton([...body, bare(683), bare(693)] as PageRecord[], -8, 227)!;
		expect(skel.boxYs).toEqual([167, 180, 194, 208]);
	});

	it('leaves out full-width material above the columns', () => {
		const fig = [bare(97, 455, 106), bare(132, 455, 20)];
		const skel = buildPageSkeleton([...fig, ...body] as PageRecord[], -8, 227)!;
		expect(skel.boxYs).toEqual([167, 180, 194, 208]);
	});

	it('so a box holding only that material no longer refuses the column', () => {
		// the figure*'s own vbox holds its lines and none of the galley's; once those lines are
		// not the column's, the box holds nothing of it and says nothing about it
		const fig = [bare(97, 455, 106), bare(132, 455, 20)];
		const fbox = { t: 'vbox', x: 0, y: 136, w: 455, h: 145, d: 0 } as PageRecord;
		expect(buildPageSkeleton([...fig, ...body, fbox] as PageRecord[], -8, 227)).not.toBeNull();
	});

	it('still refuses a float the engine pinned INSIDE the galley', () => {
		// stamped lines held by a marker box: material the page builder DID break around, and
		// re-breaking it would answer a question TeX never asks
		const fbox = { t: 'vbox', x: 0, y: 197, w: 219, h: 30, d: 0 } as PageRecord;
		expect(buildPageSkeleton([...body, fbox] as PageRecord[], -8, 227)).toBeNull();
	});

	it('a build that stamps nothing keeps its older reading', () => {
		// every line unstamped is an engine without the attribute, not a column of footnotes
		const skel = buildPageSkeleton([bare(167), bare(180), bare(194)] as PageRecord[], -8, 227)!;
		expect(skel.boxYs).toEqual([167, 180, 194]);
	});
});
