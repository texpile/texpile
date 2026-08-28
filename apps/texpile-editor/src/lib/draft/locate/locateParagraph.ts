/* eslint-disable @typescript-eslint/no-explicit-any */
import { locateBySource } from './locateBySource';
import { memoizeTypesets } from './memoizeTypesets';
import { locateForward } from './locateForward';
import { locateByGlyphs } from './locateByGlyphs';
import { locateCrossPage } from './locateCrossPage';
import { locateInverse } from './locateInverse';
import type { Cal, CalBail, LocateContext } from './locate.types';

// forward-tier bail reasons that fall through to the content tiers: an anchor failure AND a
// geometry mismatch are both just as often a mis-anchored window (wrong column, polluted
// rows) as a real stretch, and the glyph tier verifies content + positions directly
const FORWARD_FALLTHROUGH_BAILS = new Set([
	'no-line-boxes',
	'no-anchor-glyphs',
	'anchor-off-grid',
	'synctex-span>N',
	'spans-boundary',
	'spread',
	'glue-gap',
	'line-count',
	'break-inside',
	'content-mismatch'
]);

// Locate the paragraph: fast forward path; then glyph-fingerprint matching (content-based,
// synctex-free); then the inverse synctex map (which can still name a column straddle).
// `invisible` on a bail: the content tier searched every page and the paragraph's glyphs
// are nowhere -- discarded content (\eat, \footnotetext) or an unreproducible break; either
// way each keystroke's full pass would show nothing new, so the caller reconciles quietly.
export async function locateParagraph(
	rawCtx: LocateContext,
	rawFile: string,
	line: number,
	orig: string,
	listItem = false,
	endLine = line
): Promise<Cal | CalBail> {
	// one calibration per (text, width) for this locate: every tier reproduces the same
	// unedited paragraph before it will believe a band, and each ask is an engine round trip
	const ctx = memoizeTypesets(rawCtx);
	const file = rawFile.replace(/\\/g, '/'); // synctex stores forward-slash input paths; a backslash query finds nothing
	// ask before searching: when the compile stamped source lines, the band is a lookup. Every
	// bail here falls through to the search tiers unchanged, so this only ever saves work --
	// including for the constructs the stamp gets wrong (list items point at the previous
	// item, whose content then fails to match).
	const src = await locateBySource(ctx, file, line, endLine, orig);
	if (!('bail' in src)) return src;
	const fwd = await locateForward(ctx, file, line, orig, listItem);
	if (!('bail' in fwd)) return fwd;
	// typesets to nothing: no band anywhere could show this edit; reconcile quietly
	if (fwd.bail === 'cal-empty') return { bail: fwd.bail, invisible: true };
	if (!FORWARD_FALLTHROUGH_BAILS.has(fwd.bail)) return fwd;
	const gm = await locateByGlyphs(ctx, file, line, endLine, orig, listItem);
	if (!('bail' in gm)) return gm;
	// synctex often reports only ONE page of a straddling paragraph (its line boxes carry
	// the \par line's page), so the forward span check never fires -- when the single-band
	// tiers can't place it, probe the hinted pages for a split: same page first (the
	// two-column straddle), then the page pairs
	{
		const pdf = ctx.pdfPath();
		const hints = new Set<number>();
		for (const ln of [line, endLine + 1]) {
			const sx: any = await ctx.synctex({ action: 'view', pdf, tex: file, line: ln, column: 0 });
			for (const b of ((sx && sx.boxes) || []) as any[]) if (b.page) hints.add(b.page);
		}
		const tried = new Set<string>();
		for (const p of hints) {
			for (const [pa, pb] of [
				[p, p],
				[p, p + 1],
				[p - 1, p]
			]) {
				if (pa < 1 || pb > ctx.pageCount() || tried.has(pa + ':' + pb)) continue;
				tried.add(pa + ':' + pb);
				const xp = await locateCrossPage(ctx, [], pa, pb, orig, listItem);
				if (!('bail' in xp)) return xp;
			}
		}
	}
	const inv = await locateInverse(ctx, file, line, endLine, orig);
	if (!('bail' in inv)) return inv;
	// the inverse's "straddles a column" is more precise than the forward's anchor failure
	const out = inv.bail === 'spans-boundary' ? inv : fwd;
	if (gm.bail === 'not-on-page') return { bail: out.bail, invisible: true };
	return out;
}
