import type { GlyphRow } from './geometry.types';

export function sameCodepoints(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

// digit-tolerant row equality: pinned counters render fixed digits and CM digits share a
// width, so a digit-for-digit difference is placement-true while the render differs
export function sameCodepointsDigitTolerant(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i] || (v >= 0x30 && v <= 0x39 && b[i] >= 0x30 && b[i] <= 0x39));
}

// rows must agree on glyph X OFFSETS too, not just codepoints: error-recovered alignment
// material (table rows) has the same sequence with totally different spacing
export function sameOffsets(a: Pick<GlyphRow, 'xs'>, b: Pick<GlyphRow, 'xs'>): boolean {
	return a.xs.length === b.xs.length && a.xs.every((x, i) => Math.abs(x - a.xs[0] - (b.xs[i] - b.xs[0])) <= 0.5);
}

// index of the first row that does not match the daemon's reproduction, glyph-for-glyph and
// offset-for-offset; -1 when every row does. A refusal names the row so a bail can be read
// rather than reproduced.
export function firstRowMismatch(bandRows: Pick<GlyphRow, 'cs' | 'xs'>[], dRows: Pick<GlyphRow, 'cs' | 'xs'>[]): number {
	if (bandRows.length !== dRows.length) return Math.min(bandRows.length, dRows.length);
	for (let i = 0; i < bandRows.length; i++)
		if (!sameCodepoints(bandRows[i].cs, dRows[i].cs) || !sameOffsets(bandRows[i], dRows[i])) return i;
	return -1;
}

// a located band IS this paragraph only if every row matches the daemon's reproduction
export function bandMatchesCalibration(bandRows: Pick<GlyphRow, 'cs' | 'xs'>[], dRows: Pick<GlyphRow, 'cs' | 'xs'>[]): boolean {
	return bandRows.length === dRows.length && firstRowMismatch(bandRows, dRows) < 0;
}
