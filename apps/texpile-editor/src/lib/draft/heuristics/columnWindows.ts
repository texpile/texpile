/* eslint-disable @typescript-eslint/naming-convention -- TeX geometry shorthand: W = column width, G = gutter */
import { columnCandidates } from './columnCandidates';
import { pageColumns } from '../geometry/pageColumns';
import type { PageRecord } from '../geometry/geometry.types';

/** a column's text left and the x-window that owns its records */
export type ColumnWindow = { x: number; colL: number; colR: number };

// The page's columns, at the width the caller is asking about, each with the x-window that
// owns its records.
//
// Origins come from the page's own column boxes whenever the compile recorded them, which is
// a strict narrowing of what the clustering elects: measured across the fixtures the
// clustering never missed a real column but invented 27 candidates that were only ever
// tested and rejected -- and, once, elected as a spill slot that painted over a title.
//
// Only columns of the REQUESTED width answer. A full-width band under twocolumn (a starred
// float wraps at \textwidth) is not one of the engine's \columnwidth columns and the engine
// has no opinion about where it starts, so it falls to the clustering like a page whose
// columns were never recorded (multicol, a float page, an older bridge).
//
// The window pads the box, for glyphs that legitimately sit outside it (italic overhang,
// hanging punctuation, \llap), but never past the midpoint of the gap to a neighbour.
// Unclamped padding overlaps adjacent windows whenever \columnsep < 2G -- a 10pt \columnsep
// against the 8pt gutter overlaps by 6pt -- and consumers take the FIRST window containing a
// record, so the left column silently claimed a strip of the right one.
export function columnWindows(recs: PageRecord[], allG: PageRecord[], W: number, G: number, colSep?: number): ColumnWindow[] {
	const cols = pageColumns(recs).filter((c) => Math.abs(c.w - W) <= 2);
	if (cols.length)
		return cols.map((c, i) => {
			const prev = cols[i - 1];
			const next = cols[i + 1];
			const padL = prev ? Math.min(G, Math.max(0, (c.x - (prev.x + prev.w)) / 2)) : G;
			const padR = next ? Math.min(G, Math.max(0, (next.x - (c.x + c.w)) / 2)) : G;
			return { x: c.x, colL: c.x - padL, colR: c.x + c.w + padR };
		});
	return columnCandidates(allG, W, G, colSep).map((x) => ({ x, colL: x - G, colR: x + W + G }));
}
