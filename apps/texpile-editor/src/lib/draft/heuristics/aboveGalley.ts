/* eslint-disable @typescript-eslint/no-explicit-any -- page records are schemaless engine JSON */
import type { PageColumn } from '../geometry/pageColumns';
import type { PageRecord } from '../geometry/geometry.types';
import type { SkelItem } from './pageSkeleton';

const EPS = 0.05;

export type ColumnRun = {
	items: SkelItem[];
	/** boxes among them, so the caller can index past them into a split's answer */
	boxes: number;
	/** the run at NATURAL size: what \@colroom is reduced by, which is not what it is set to */
	natural: number;
};

export type AboveGalley = ColumnRun & {
	/** the column box's own top edge: what the placement's baselines are measured from */
	top: number;
};

// A span of a column's own vertical list, as skeleton items the engine can re-set.
//
// The skeleton models galley LINES, which quietly asserted that everything else in the column
// holds still. It does not: \textfloatsep stretches to help fill the column, so a run arriving
// from an earlier column lets the engine take that stretch back and the galley rises under it
// -- 4pt on a page carrying a figure and a table, both separations stretched ~10.8pt.
//
// The walk is the walker's own: records arrive in vertical-list order between this column's
// col/colend markers, and a running cursor tells top-level items from nested ones -- a record
// whose top edge is not AT the cursor is inside the box that is (a float's caption lines, its
// rules). Effective widths move the cursor, natural widths go into the items: the point is to
// hand the engine the list unset and let it set it again.
//
// Returns null unless the run lands exactly on `to`. A model that cannot reproduce the column
// is not one to certify against, and that check is the whole safety of this file.
export function columnRun(recs: PageRecord[], col: PageColumn, from: number, to: number): ColumnRun | null {
	const items: SkelItem[] = [];
	let boxes = 0;
	let natural = 0;
	let cursor = from;
	let inside = false;
	for (const r of recs as any[]) {
		if (r.t === 'colend') {
			if (inside) break;
			continue;
		}
		if (r.t === 'col') {
			inside = Math.abs(r.x - col.x) <= EPS && Math.abs(r.w - col.w) <= EPS;
			continue;
		}
		if (!inside) continue;
		if (Math.abs(cursor - to) <= EPS) break;
		// the column box's OWN marker: a one-column page reaches its column straight down the
		// page's vertical list, and the walker emits the vbox alongside the col record rather
		// than instead of it. Consuming it swallows the whole column as one box.
		if (r.t === 'vbox' && Math.abs(r.y - r.h - col.top) <= EPS && Math.abs(r.h + (r.d ?? 0) - (col.bottom - col.top)) <= EPS) continue;
		const top = topEdge(r);
		if (top === null || Math.abs(top - cursor) > EPS) continue;
		if (r.t === 'vg') {
			items.push({ t: 'g', w: r.nw ?? r.w, st: r.st || 0, sto: r.sto || 0, sh: r.sh || 0, sho: r.sho || 0 });
			natural += r.nw ?? r.w;
		} else if (r.t === 'vk') {
			items.push({ t: 'g', w: r.w, st: 0, sto: 0, sh: 0, sho: 0 });
			natural += r.w;
		} else if (r.t === 'pen') items.push({ t: 'p', p: r.p });
		// a rule in here is furniture, not a breakpoint the flow may land on: its extent is
		// what the column needs from it
		else if (r.t === 'rule') {
			items.push({ t: 'g', w: (r.h ?? 0) + (r.d ?? 0), st: 0, sto: 0, sh: 0, sho: 0 });
			natural += (r.h ?? 0) + (r.d ?? 0);
		} else {
			items.push({ t: 'b', h: r.h ?? 0, d: r.d ?? 0 });
			natural += (r.h ?? 0) + (r.d ?? 0);
			boxes++;
		}
		cursor += advance(r);
	}
	return Math.abs(cursor - to) <= EPS ? { items, boxes, natural } : null;
}

/**
 * the run between the column's top edge and the galley's body top -- a float pinned at the
 * top and the separation under it. Stops short of the galley's \topskip glue: TeX sets that
 * one from the height of whatever box lands there, which is the caller's question.
 */
export function aboveGalley(recs: PageRecord[], col: PageColumn, bodyTop: number): AboveGalley | null {
	const run = columnRun(recs, col, col.top, bodyTop);
	return run && { ...run, top: col.top };
}

/**
 * the run between the galley's foot and the column's bottom edge -- a float pinned at the
 * BOTTOM, mostly. Unmodelled, its room is slack the placement pack hands to the text: a
 * 27.76pt table under a column spread every line above it.
 */
export function belowGalley(recs: PageRecord[], col: PageColumn, galleyFoot: number): ColumnRun | null {
	return columnRun(recs, col, galleyFoot, col.bottom);
}

/**
 * TeX's landing rule as an item: the first box under a body top sits \topskip below it
 * unless the box is taller, so the glue is what the arriving height leaves of \topskip.
 */
export function topSkipGlue(topSkip: number, h: number): SkelItem {
	return { t: 'g', w: Math.max(0, topSkip - h), st: 0, sto: 0, sh: 0, sho: 0 };
}

function topEdge(r: any): number | null {
	if (r.t === 'vbox' || r.t === 'pl' || r.t === 'image' || r.t === 'lit' || r.t === 'rule') return r.y - (r.h ?? 0);
	if (r.t === 'vg' || r.t === 'vk' || r.t === 'pen') return r.y;
	return null;
}

function advance(r: any): number {
	if (r.t === 'vg' || r.t === 'vk') return r.w ?? 0;
	if (r.t === 'pen') return 0;
	return (r.h ?? 0) + (r.d ?? 0);
}
