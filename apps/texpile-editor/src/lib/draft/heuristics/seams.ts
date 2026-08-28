/* eslint-disable @typescript-eslint/naming-convention -- TeX geometry shorthand: W = column width */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { COL_GUTTER } from './tolerances';
import { pageColumns } from '../geometry/pageColumns';
import type { PageRecord } from '../geometry/geometry.types';
import type { SeamEntry } from '../patch/seam.types';
import type { SkelItem } from './pageSkeleton';

// Junction truth for moved breaks: the pruned run the compile captured at each break is
// exactly the vertical material that reappears when content flows across the old break
// point. Lookups are by SOURCE column: the seam after column j of page P sits between it
// and the next slot in reading order, whether that slot is a column or the next page.

/**
 * the seam recorded after the given 1-based column of a page, or null. The capture counts
 * output FIRINGS, the caller counts visible columns, and they agree only when each column
 * of the page broke on its own: a package that splits its own columns (multicol) fires
 * once for the whole page and would serve the page junction as if it were the first
 * column's. Serve nothing unless the two counts match.
 */
export function seamAfter(seams: SeamEntry[], page: number, col: number, pageRecs: PageRecord[], W: number): SeamEntry | null {
	// by firing ordinal when both sides carry it: the column record and the seam were stamped
	// with the same number, so the seam after column N is a lookup, not a count that only
	// happens to line up when every column of the page broke on its own
	const boxes = pageColumns(pageRecs).filter((c) => Math.abs(c.w - W) <= 2);
	const mine = boxes[col - 1];
	if (mine?.i !== undefined) return seams.find((s) => s.page === page && s.fire === mine.i) ?? null;
	const cols = columnOrigins(pageRecs, W).length;
	if (!cols || seams.filter((s) => s.page === page).length !== cols) return null;
	return seams.find((s) => s.page === page && s.col === col) ?? null;
}

/** a forced break (\newpage and friends) may not move: no chain across it */
export function seamForced(s: SeamEntry): boolean {
	return s.pen <= -10000;
}

/**
 * the pruned run as skeleton items, ready to splice at a junction. The engine neutralizes
 * the chosen break's penalty node to 10000 before saving the run; restore the true value
 * so a re-split at this junction faces the page builder's own numbers. null when the run
 * carries anything the skeleton cannot represent.
 */
export function seamItems(s: SeamEntry): SkelItem[] | null {
	const items: SkelItem[] = [];
	for (let i = 0; i < s.run.length; i++) {
		const r = s.run[i];
		if (r.x) return null;
		if (r.p !== undefined) items.push({ t: 'p', p: i === 0 && r.p === 10000 && s.pen !== 10000 ? s.pen : r.p });
		else if (r.k !== undefined) items.push({ t: 'g', w: r.k, st: 0, sto: 0, sh: 0, sho: 0 });
		else items.push({ t: 'g', w: r.w ?? 0, st: r.st ?? 0, sto: r.sto ?? 0, sh: r.sh ?? 0, sho: r.sho ?? 0 });
	}
	return items;
}

/** natural height of the run's glue and kerns (the junction gap at unstretched width) */
export function seamHeight(s: SeamEntry): number {
	return s.run.reduce((sum, r) => sum + (r.w ?? 0) + (r.k ?? 0), 0);
}

/**
 * the page's column origins in reading order. The page's own column boxes when the compile
 * recorded them; otherwise the older inference from engine-broken lines, which sees a column
 * only where a paragraph was broken at exactly column width -- a column holding nothing but
 * a float is invisible to it, and an undercount here silently refuses the page's seams.
 */
function columnOrigins(pageRecs: PageRecord[], W: number): number[] {
	const cols = pageColumns(pageRecs).filter((c) => Math.abs(c.w - W) <= 2);
	if (cols.length) return cols.map((c) => c.x);
	const origins: number[] = [];
	for (const r of pageRecs as any[]) {
		if (r.t !== 'pl' || Math.abs(r.w - W) > 2) continue;
		if (!origins.some((o) => Math.abs(o - r.x) <= 2)) origins.push(r.x);
	}
	return origins.sort((a, b) => a - b);
}

/**
 * 1-based reading-order index of the column whose window contains colL. 0 = no proven
 * origin within a gutter of the window: seam lookups must not guess.
 */
export function columnIndexOf(pageRecs: PageRecord[], W: number, colL: number): number {
	// a window opens somewhere in [origin - gutter, origin]: test the range rather than
	// reconstructing the text left as colL + gutter, which assumes a full pad and drifts
	// once the pad narrows to keep adjacent windows apart
	return columnOrigins(pageRecs, W).findIndex((o) => colL >= o - COL_GUTTER - 1 && colL <= o + 1) + 1;
}
