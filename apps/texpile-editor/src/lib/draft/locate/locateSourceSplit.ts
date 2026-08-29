/* eslint-disable @typescript-eslint/no-explicit-any */
import { COL_GUTTER, GLUE_GAP_TOL, LINE_GAP_FALLBACK, SPREAD_TOL } from '../heuristics/tolerances';
import { INDENT_PREFIX } from '../daemonIndent';
import { bandFontPrefix } from './bandFont';
import { bandWindow } from '../geometry/bandWindow';
import { columnWindows } from '../heuristics/columnWindows';
import { glyphRows } from '../geometry/glyphRows';
import { median } from '../geometry/median';
import { firstRowMismatch } from '../geometry/rowEquality';
import { sourceFragments } from './sourceFragments';
import type { Cal, CalBail, LocateContext } from './locate.types';
import type { SourceFrag } from './sourceFragments';

// The straddle, asked rather than searched. A paragraph broken across a column or page break
// is two stamped runs, and the number of lines in the FIRST one is the split point -- the one
// fact the fuzzy tier has to recover by trying every cut against every column pair, which is
// both slow and, when the same words appear twice, capable of landing on the wrong text.
//
// Knowing the page's own split point is also what lets a split render stop apologising: if the
// engine puts the edited paragraph's break back on the same line and neither fragment changes
// height, nothing below either fragment moves and the render IS what a recompile produces.
// This tier records that break for the patcher; it does not decide it.
export async function locateSourceSplit(
	ctx: LocateContext,
	file: string,
	line: number,
	endLine: number,
	orig: string
): Promise<Cal | CalBail> {
	function bail(why: string, detail?: unknown): CalBail {
		ctx.emit('locate-split-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return { bail: why };
	}
	const paper = ctx.paper();
	if (!paper.srcFiles?.length) return bail('no-source-map');
	const found = sourceFragments(ctx, paper.srcFiles, file, line, endLine);
	if ('bail' in found) return bail(found.bail, found.detail);
	const { frags } = found;
	// one fragment is the ordinary band, and three would need a second spill the patch geometry
	// cannot carry; both belong to other tiers
	if (frags.length !== 2) return bail('not-two-fragments', { frags: frags.length });
	const [fa, fb] = frags;
	if (ctx.rtlPage(fa.pageNo) || ctx.rtlPage(fb.pageNo)) return bail('page-rtl', { pA: fa.pageNo, pB: fb.pageNo });
	const all = [...fa.lines, ...fb.lines];
	const raw = median(all.map((l) => l.w));
	if (!(raw > 0)) return bail('no-width');
	const W = [paper.colW, paper.textW].find((k) => k > 0 && Math.abs(k - raw) <= 0.5) ?? raw;

	function win(f: SourceFrag): { recs: any[]; glyphs: any[]; colL: number; colR: number } | null {
		const recs = ctx.pageRecords(f.pageNo) as any[];
		const glyphs = recs.filter((x) => x.t === 'g');
		if (!glyphs.length) return null;
		const c = columnWindows(recs, glyphs, W, COL_GUTTER, paper.colSep).find((k) => f.lines[0].x >= k.colL && f.lines[0].x <= k.colR);
		return c ? { recs, glyphs, colL: c.colL, colR: c.colR } : null;
	}
	const wa = win(fa),
		wb = win(fb);
	if (!wa || !wb) return bail('no-column', { a: fa.lines[0].x, b: fb.lines[0].x });

	// the font comes off the LONGER fragment: same measurement as the single-band tier, taken
	// where the tally is strongest
	const long = fa.lines.length >= fb.lines.length ? { w: wa, f: fa } : { w: wb, f: fb };
	const measured = bandFontPrefix(long.w.recs, long.f.lines);
	function rowsOf(w: NonNullable<typeof wa>, f: SourceFrag, gap: number) {
		const y = bandWindow(f.lines[0].y, f.lines[f.lines.length - 1].y, gap);
		return glyphRows(
			w.glyphs.filter((g: any) => g.x >= w.colL && g.x <= w.colR && g.y >= y.top && g.y <= y.bottom),
			gap
		);
	}
	// only fragment A carries the paragraph's first line, so it alone can be indented
	const probe = rowsOf(wa, fa, paper.blSkip || LINE_GAP_FALLBACK);
	const indented = probe.length > 1 && probe[0].left > Math.min(...probe.slice(1).map((r) => r.left)) + 2;
	const nA = fa.lines.length,
		nB = fb.lines.length;
	const tries: { pre: string; ind: boolean }[] = [];
	for (const p of measured ? [measured, ''] : ['']) for (const ind of indented ? [true, false] : [false, true]) tries.push({ pre: p, ind });
	// every variant that breaks to the page's line count is a CANDIDATE, and the glyphs decide
	// between them. Stopping at the first was enough for a single band, where a wrong variant
	// simply fails and the search tiers take over; here the wrong one costs the split point,
	// which is the whole reason to ask.
	let won: { calLines: any[]; calGap: number; gap: number; dRows: any[]; rowsA: any[]; rowsB: any[]; ind: boolean; pre: string } | null =
		null;
	let why = 'no-matching-cal';
	let where = -1;
	for (const t of tries) {
		const c = await ctx.typesetParagraph({ text: t.pre + (t.ind ? INDENT_PREFIX : '') + orig, hsize: W });
		if (!c.ok || (c.stats && (c.stats as any).certified === false)) continue;
		const calLines = c.records.filter((x: any) => x.t === 'line');
		if (calLines.length !== nA + nB) continue;
		const calGaps: number[] = [];
		for (let i = 1; i < calLines.length; i++) calGaps.push(calLines[i].y - calLines[i - 1].y);
		const calGap = median(calGaps);
		const gap = calGap || paper.blSkip || LINE_GAP_FALLBACK;
		const dRows = glyphRows(
			c.records.filter((x: any) => x.t === 'g' || x.t === 'glyph'),
			gap
		);
		if (dRows.length !== nA + nB) {
			why = 'cal-row-count';
			where = dRows.length;
			continue;
		}
		const rowsA = rowsOf(wa, fa, gap),
			rowsB = rowsOf(wb, fb, gap);
		const missA = firstRowMismatch(rowsA, dRows.slice(0, nA));
		if (missA >= 0) {
			why = 'content-mismatch-a';
			where = missA;
			continue;
		}
		const missB = firstRowMismatch(rowsB, dRows.slice(nA));
		if (missB >= 0) {
			why = 'content-mismatch-b';
			where = missB;
			continue;
		}
		won = { calLines, calGap, gap, dRows, rowsA, rowsB, ind: t.ind, pre: t.pre };
		break;
	}
	if (!won) return bail(why, { nA, nB, row: where, measured: !!measured, tries: tries.length });
	const { calLines, calGap, gap, dRows, rowsA, rowsB } = won;
	const indent = won.ind,
		pre = won.pre;

	const b1 = fa.lines[0].y,
		bk = fa.lines[nA - 1].y;
	const s1 = fb.lines[0].y,
		sk = fb.lines[nB - 1].y;
	// each fragment must also stand at the daemon's OWN spacing, or the splice would render one
	// leading where the page carries another: that is a placement-true but respaced render, and
	// the patcher must not call it exact
	function spanOk(pageSpan: number, from: number, to: number): boolean {
		return Math.abs(pageSpan - (calLines[to - 1].y - calLines[from].y)) <= SPREAD_TOL;
	}
	function gapsOk(lines: { y: number }[]): boolean {
		return !calGap || lines.length < 2 || Math.abs(median(lines.slice(1).map((l, i) => l.y - lines[i].y)) - calGap) <= GLUE_GAP_TOL;
	}
	const stretched = !spanOk(bk - b1, 0, nA) || !spanOk(sk - s1, nA, nA + nB) || !gapsOk(fa.lines) || !gapsOk(fb.lines);
	ctx.emit('locate-split-ok', { pA: fa.pageNo, pB: fb.pageNo, nA, nB, samePage: fa.pageNo === fb.pageNo, stretched });
	return {
		pageNo: fa.pageNo,
		b1,
		bk,
		medGap: gap,
		paraLeft: Math.min(...rowsA.map((r) => r.left)) - Math.min(...dRows.slice(0, nA).map((r) => r.left)),
		W,
		colL: wa.colL,
		colR: wa.colR,
		indent,
		...(pre ? { pre } : {}),
		splitAt: nA,
		...(stretched ? { approx: true, approxStretch: true } : {}),
		spill: {
			...(fa.pageNo === fb.pageNo ? {} : { pageNo: fb.pageNo }),
			b1: s1,
			bk: sk,
			colL: wb.colL,
			colR: wb.colR,
			h1: fb.lines[0].h,
			paraLeft: Math.min(...rowsB.map((r) => r.left)) - Math.min(...dRows.slice(nA).map((r) => r.left))
		}
	};
}
