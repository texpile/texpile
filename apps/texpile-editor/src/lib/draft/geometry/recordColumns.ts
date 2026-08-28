/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from './geometry.types';

// Which column each record belongs to, by its position in the stream rather than by its x.
//
// The walker emits depth-first in reading order and brackets each column's contents between
// a `col` and a `colend`, so membership is a fact the compile recorded, not a test we invent.
// -1 means the record is in no column: page furniture, a running head, a float that spans the
// text block.
//
// Measured on a float-heavy two-column paper: 39,335 glyphs inside a run, ONE of them outside
// its own box (real overhang, which the x-window also gets wrong). More importantly 2,010
// glyphs sit outside every run, and an x-window would wrongly claim 2,006 of them for a
// column -- a full-width figure lies inside column one's x-range, and a footer often does too.
export function recordColumns(recs: PageRecord[]): number[] {
	const out = new Array<number>(recs.length).fill(-1);
	let cur = -1;
	let idx = -1;
	for (let i = 0; i < recs.length; i++) {
		const r = recs[i] as any;
		if (r.t === 'col') {
			// a zero-width box is an empty trailing column: real, but it owns no records
			if (r.w > 0) cur = ++idx;
		} else if (r.t === 'colend') {
			cur = -1;
		} else {
			out[i] = cur;
		}
	}
	return out;
}

/** true when this page's compile recorded columns at all (multicol and float pages do not) */
export function hasRecordedColumns(recs: PageRecord[]): boolean {
	return (recs as any[]).some((r) => r.t === 'col' && r.w > 0);
}
