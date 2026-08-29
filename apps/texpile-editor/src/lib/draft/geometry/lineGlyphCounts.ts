/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from './geometry.types';

// How many glyphs each line of a daemon typeset carries, by nearest baseline. Assigning by
// distance rather than by record order because the daemon's stream interleaves fonts and
// rules between a line and its glyphs, and a line whose glyphs sit on a shifted baseline
// (a superscript, inline maths) still belongs to the line it is nearest.
export function lineGlyphCounts(records: PageRecord[], lineRecs: PageRecord[]): number[] {
	const counts = new Array<number>(lineRecs.length).fill(0);
	if (!lineRecs.length) return counts;
	for (const g of records as any[]) {
		if (g.t !== 'g' && g.t !== 'glyph') continue;
		let best = 0,
			bestD = Infinity;
		for (let i = 0; i < lineRecs.length; i++) {
			const d = Math.abs((lineRecs[i] as any).y - g.y);
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		}
		counts[best]++;
	}
	return counts;
}
