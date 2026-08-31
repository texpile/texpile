/* eslint-disable @typescript-eslint/no-explicit-any */
// The carried run's RECORDS, moved from the source column's tail to their certified
// landing: a pure translation per line. Every carried row keeps the line it belonged to
// (nearest old baseline), and moves by exactly that line's certified displacement -- no
// record is retypeset, so the ink is the page's own.
import type { PageRecord } from '../geometry/record.types';

export function relocateCarried(
	recs: PageRecord[],
	oldBases: number[],
	newBases: number[],
	window: { yTop: number; yBottom: number; colL: number; colR: number },
	dx: number
): any[] {
	const out: any[] = [];
	for (const r of recs as any[]) {
		if (r.t !== 'g' && r.t !== 'rule' && r.t !== 'image') continue;
		if (r.y === undefined || r.y < window.yTop || r.y > window.yBottom) continue;
		if (r.x !== undefined && (r.x < window.colL - 2 || r.x > window.colR + 2)) continue;
		let j = 0;
		for (let k = 1; k < oldBases.length; k++) if (Math.abs(oldBases[k] - r.y) < Math.abs(oldBases[j] - r.y)) j = k;
		out.push({ ...r, x: (r.x ?? 0) + dx, y: r.y + (newBases[j] - oldBases[j]) });
	}
	return out;
}
