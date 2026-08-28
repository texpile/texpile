/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from '../geometry/geometry.types';

/** the paintable ink of a column's y-window, plus the font records it needs */
export function carriedRecords(recs: PageRecord[], colL: number, colR: number, clipY: number, floor: number): PageRecord[] {
	return (recs as any[]).filter(
		(x) =>
			x.t === 'font' ||
			((x.t === 'g' || x.t === 'rule' || x.t === 'image' || x.t === 'lit') &&
				x.x >= colL &&
				x.x <= colR &&
				(x.y ?? 0) > clipY &&
				(x.y ?? 0) <= floor)
	);
}

// move each record with its NEAREST baseline, like remapBandRecords does for band
// lines, so sub-line ink (rules, inline images) rides its row
export function remapCarried(recs: PageRecord[], oldBases: number[], newBases: number[]): PageRecord[] {
	return (recs as any[]).map((r) => {
		if (r.y === undefined || r.t === 'font') return r;
		let best = 0,
			bd = Infinity;
		for (let j = 0; j < oldBases.length; j++) {
			const dd = Math.abs(r.y - oldBases[j]);
			if (dd < bd) {
				bd = dd;
				best = j;
			}
		}
		return { ...r, y: r.y + newBases[best] - oldBases[best] };
	});
}
