/* eslint-disable @typescript-eslint/no-explicit-any */
// Where edited source lines sit on a page: the line records stamped with their file and line.
import type { EditBand } from '../draftViewport.svelte';

/** the band of the line records from source lines from..to of file `sf`, or null when none is on the page */
export function editBand(page: number, records: any[], sf: number, from: number, to: number): EditBand | null {
	let top = Infinity;
	let bottom = -Infinity;
	let colL = Infinity;
	let colR = -Infinity;
	for (const r of records) {
		if (r.t !== 'pl' || r.s === undefined || (r.sf ?? 0) !== sf || r.s < from || r.s > to) continue;
		top = Math.min(top, r.y - r.h);
		bottom = Math.max(bottom, r.y + (r.d ?? 0));
		colL = Math.min(colL, r.x);
		colR = Math.max(colR, r.x + r.w);
	}
	return top === Infinity ? null : { page, top, bottom, colL, colR };
}
