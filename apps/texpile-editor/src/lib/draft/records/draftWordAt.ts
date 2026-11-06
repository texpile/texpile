/* eslint-disable @typescript-eslint/no-explicit-any */
// The word under a click, rebuilt from the page's glyph records (same baseline row,
// expanded to the nearest space-gaps). It anchors the source jump against line drift,
// exactly like the PDF viewer's double-clicked word. Type1 slots map to text through
// the parsed font's AGL table; anything unmappable just ends the word.
export function wordAt(records: any[], textMapOf: (r: any) => number[] | undefined, xPt: number, yPt: number): string | undefined {
	const uniOf: Record<number, { uni?: number[]; size: number }> = {};
	for (const r of records) if (r.t === 'font') uniOf[r.id] = { uni: textMapOf(r), size: r.size || 10 };
	// glyphs whose baseline sits just below the click (text spans roughly [y-0.8em, y+0.2em])
	const band = records.filter((r: any) => r.t === 'g' && r.y >= yPt - 2 && r.y <= yPt + 9);
	if (!band.length) return undefined;
	const base = band.reduce((b: any, g: any) => (Math.abs(g.y - yPt - 4) < Math.abs(b.y - yPt - 4) ? g : b)).y;
	const row = band.filter((g: any) => Math.abs(g.y - base) < 2).sort((a: any, b: any) => a.x - b.x);
	let i = row.findIndex((g: any) => xPt >= g.x && xPt <= g.x + (g.w || 0));
	if (i < 0) i = row.reduce((bi: number, g: any, gi: number) => (Math.abs(g.x - xPt) < Math.abs(row[bi].x - xPt) ? gi : bi), 0);
	function gapAfter(k: number) {
		return row[k + 1].x - (row[k].x + (row[k].w || 0));
	}
	function isGap(k: number) {
		return gapAfter(k) > Math.max(0.9, 0.13 * (uniOf[row[k].f]?.size || 10));
	}
	let lo = i,
		hi = i;
	while (lo > 0 && !isGap(lo - 1)) lo--;
	while (hi < row.length - 1 && !isGap(hi)) hi++;
	let word = '';
	for (let k = lo; k <= hi; k++) {
		const g = row[k];
		const u = uniOf[g.f]?.uni;
		const cp = u ? u[g.c] || 0 : g.c;
		if (cp < 32 || cp > 0xffff) return word.length >= 2 ? word : undefined; // ligature/PUA: keep what we have
		word += String.fromCodePoint(cp);
	}
	return word.length >= 2 ? word : undefined;
}
