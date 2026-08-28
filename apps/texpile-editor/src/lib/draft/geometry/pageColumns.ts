/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from './geometry.types';

// i = the output firing that built this column. The seam recorded after it carries the same
// ordinal, which is what lets a seam be matched to its column rather than counted into place.
export type PageColumn = { x: number; w: number; top: number; bottom: number; i?: number };

// The page's columns as the output routine actually built them. page-extract stamps every
// top-level node of \box255 with the output firing that produced it, and the walker emits
// the box still holding those nodes at shipout -- so this is the engine's own origin and
// width, not a cluster of glyph left edges.
//
// Reading order is x ascending. Every consumer refuses an RTL page before asking.
export function pageColumns(recs: PageRecord[]): PageColumn[] {
	const cols: PageColumn[] = [];
	for (const r of recs as any[]) {
		// a zero-width column box is an empty trailing column: real, but with no horizontal
		// extent it can own no records, so it is not a column for placement
		if (r.t !== 'col' || !(r.w > 0)) continue;
		cols.push({ x: r.x, w: r.w, top: r.y - r.h, bottom: r.y + r.d, ...(r.i === undefined ? {} : { i: r.i }) });
	}
	return cols.sort((a, b) => a.x - b.x);
}
