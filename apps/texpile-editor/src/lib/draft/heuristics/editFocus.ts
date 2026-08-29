/* eslint-disable @typescript-eslint/no-explicit-any */
import { editedLineRange } from './editedLineRange';
import { lineGlyphCounts } from '../geometry/lineGlyphCounts';
import type { PageRecord } from '../geometry/geometry.types';

export type EditFocus = { page: number; top: number; bottom: number; colL: number; colR: number };

/** one painted run of the band: the line it starts at, and where that run lands on a page */
export type FocusSeg = { page: number; top: number; from: number; colL: number; colR: number };

// Where the user is actually typing, as a page band. A patch paints its lines at `seg.top +
// line.y`, so a line index becomes a page position once the segment holding it is known -- and
// for a straddling paragraph there are two segments on two different pages, which is the whole
// point: the edit belongs to exactly one of them. Falls back to the whole band when the lines
// cannot be told apart, which is never worse than what it replaces.
export function editFocus(
	orig: string,
	text: string,
	records: PageRecord[],
	lineRecs: PageRecord[],
	segs: FocusSeg[],
	whole: EditFocus,
	ext: { h1: number; dk: number }
): EditFocus {
	if (!segs.length || !lineRecs.length) return whole;
	const range = editedLineRange(orig, text, lineGlyphCounts(records, lineRecs));
	// the segment holding the LAST changed line: that is where the cursor came to rest
	let si = 0;
	for (let i = 0; i < segs.length; i++) if (segs[i].from <= range.to) si = i;
	const seg = segs[si];
	const end = si + 1 < segs.length ? segs[si + 1].from - 1 : lineRecs.length - 1;
	const lo = Math.min(Math.max(range.from, seg.from), end);
	const hi = Math.min(Math.max(range.to, lo), end);
	const a: any = lineRecs[lo],
		b: any = lineRecs[hi];
	if (!a || !b) return whole;
	return {
		page: seg.page,
		top: seg.top + a.y - (a.h ?? ext.h1),
		bottom: seg.top + b.y + (b.d ?? ext.dk),
		colL: seg.colL,
		colR: seg.colR
	};
}
