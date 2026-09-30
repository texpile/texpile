// The `columns:` track list, read both ways. Shared so the serializer and the DOM-side plugin can
// never disagree about what a track means.
//
// The px<->track split matters: an ABSOLUTE track (3cm) is a real width and can be applied
// directly, but `fr` is a SHARE of whatever space the table gets. Turning an fr into a fixed pixel
// count is only valid once something has measured the table - do it at parse time and a reopened
// table pins itself to a nominal width instead of filling the pane.

/** absolute typst lengths -> CSS px */
const LENGTH_PX: Record<string, number> = { pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

export type Track = { kind: 'auto' } | { kind: 'fr'; value: number } | { kind: 'abs'; px: number };

/** one track's text -> its meaning; unrecognised forms are treated as auto. */
export function parseTrack(text: string): Track {
	const t = text.trim();
	const fr = /^([0-9]*\.?[0-9]+)fr$/.exec(t);
	if (fr) return { kind: 'fr', value: parseFloat(fr[1]) };
	const abs = /^([0-9]*\.?[0-9]+)(pt|mm|cm|in)$/.exec(t);
	if (abs) return { kind: 'abs', px: Math.round(parseFloat(abs[1]) * LENGTH_PX[abs[2]]) };
	return { kind: 'auto' };
}

/**
 * A verbatim `columns:` value -> one Track per column, or null when the spec cannot describe
 * `cols` columns. Null means stale: a column was added or removed since it was written, so it
 * describes a layout that no longer exists and is not a baseline for anything.
 */
export function parseTracks(colspec: unknown, cols: number): Track[] | null {
	const spec = typeof colspec === 'string' ? colspec.trim() : '';
	if (/^\d+$/.test(spec)) return Number(spec) === cols ? new Array(cols).fill({ kind: 'auto' } as Track) : null;
	if (!spec.startsWith('(') || !spec.endsWith(')') || /[()]/.test(spec.slice(1, -1))) return null;
	const parts = spec
		.slice(1, -1)
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s !== '');
	return parts.length === cols ? parts.map(parseTrack) : null;
}

/**
 * Distribute `total` px across tracks: absolute tracks take their own width, `fr` tracks share what
 * is left in proportion, and `auto` tracks are left null for the browser to size.
 *
 * Rounding residue lands on the last fr track so the widths sum to EXACTLY `total`. That is not
 * cosmetic: prosemirror-tables pins a fully-sized table to the sum of its columns, so a few pixels
 * over the container is the difference between a table that fits and one with a scrollbar.
 */
export function distribute(tracks: Track[], total: number): (number | null)[] {
	const out: (number | null)[] = tracks.map((t) => (t.kind === 'abs' ? t.px : null));
	const frIdx = tracks.map((t, i) => (t.kind === 'fr' ? i : -1)).filter((i) => i >= 0);
	if (frIdx.length === 0) return out;
	const absTotal = out.reduce<number>((a, w) => a + (w ?? 0), 0);
	const share = Math.max(0, total - absTotal);
	const units = frIdx.reduce((a, i) => a + (tracks[i] as { value: number }).value, 0);
	if (!(units > 0) || share === 0) return out;
	let used = 0;
	frIdx.forEach((i, n) => {
		if (n === frIdx.length - 1) {
			out[i] = share - used; // residue, so the sum is exact
			return;
		}
		const w = Math.round((share * (tracks[i] as { value: number }).value) / units);
		out[i] = w;
		used += w;
	});
	return out;
}

/** Columns snap to quarter-fr steps rather than landing wherever the mouse stopped. A drag is a
 *  coarse gesture and the result is source somebody reads: `(1.25fr, 0.75fr, 1fr)` is a layout,
 *  `(1.2371fr, 0.7602fr, 1.0027fr)` is a mouse position. Snapping also makes the round trip exact -
 *  px -> fr -> px lands back on the same grid instead of accumulating float noise. */
export const FR_STEP = 0.25;

export function snapFr(value: number) {
	return Math.max(FR_STEP, Math.round(value / FR_STEP) * FR_STEP);
}

/** measured px widths -> snapped fr shares, normalised so an even grid reads 1fr each. */
export function toFrShares(widths: (number | null)[]): (number | null)[] | null {
	const sized = widths.filter((w): w is number => w != null);
	if (sized.length === 0) return null;
	const mean = sized.reduce((a, b) => a + b, 0) / sized.length;
	if (!(mean > 0)) return null;
	return widths.map((w) => (w == null ? null : snapFr(w / mean)));
}

/**
 * Measured px widths -> an `fr` track list. Columns with no width stay `auto`; null when nothing
 * was sized at all, which is the caller's cue to keep the colspec it already had.
 */
export function toFrTracks(widths: (number | null)[]): string | null {
	const shares = toFrShares(widths);
	if (!shares) return null;
	return `(${shares.map((s) => (s == null ? 'auto' : `${Number(s.toFixed(2))}fr`)).join(', ')})`;
}
