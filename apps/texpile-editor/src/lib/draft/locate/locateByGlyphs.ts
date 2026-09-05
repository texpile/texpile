/* eslint-disable @typescript-eslint/no-explicit-any */
import { INDENT_PREFIX } from '../daemonIndent';
import { COL_GUTTER, GLUE_GAP_TOL, LINE_GAP_FALLBACK, ROW_BREAK } from '../heuristics/tolerances';
import { columnWindows } from '../heuristics/columnWindows';
import { extraCalVariants } from '../heuristics/calVariants';
import { glyphRows } from '../geometry/glyphRows';
import { median } from '../geometry/median';
import { sameCodepoints, sameCodepointsDigitTolerant, sameOffsets } from '../geometry/rowEquality';
import type { Cal, CalBail, LocateContext } from './locate.types';

// Glyph-fingerprint location: find the daemon's typeset of the UNEDITED paragraph on the page
// by matching glyph codepoint rows. Pure content matching -- synctex only hints which page to
// search, so synctex attribution fuzziness (the chief "could not locate" source) drops out of
// the critical path. Indent-invariant (sequences, not x positions). An exact per-row match of
// all N rows is stronger evidence than any synctex anchor; a same-glyphs different-breaks
// match (daemon \noindent vs an indented paragraph) returns an approx cal, which the caller
// refuses (approx-locate). Ambiguity (identical paragraph twice) bails rather than guessing.
export async function locateByGlyphs(
	ctx: LocateContext,
	file: string,
	line: number,
	endLine: number,
	orig: string,
	listItem: boolean
): Promise<Cal | CalBail> {
	function bail(why: string, detail?: unknown): CalBail {
		ctx.emit('locate-glyph-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return { bail: why };
	}
	const paper = ctx.paper();
	const pdf = ctx.pdfPath();
	if (!(paper.colW > 0)) return bail('no-colwidth');
	const W = paper.colW;
	const G = COL_GUTTER;
	// page search order: synctex page hints (reliable at page granularity even when its line
	// attribution isn't), then the rest
	const hintPages: number[] = [];
	for (const ln of [line, endLine + 1]) {
		const sx: any = await ctx.synctex({ action: 'view', pdf, tex: file, line: ln, column: 0 });
		for (const b of ((sx && sx.boxes) || []) as any[]) if (b.page && !hintPages.includes(b.page)) hintPages.push(b.page);
	}
	const order = [...hintPages, ...ctx.pageNumbers().filter((p) => !hintPages.includes(p))];
	// Calibration VARIANTS, matched empirically against the page (~2ms each, once per
	// paragraph per compile): indent x width x font. TeX indents mid-section paragraphs but
	// the daemon's box is \noindent, which shifts the first line's break. Under twocolumn a
	// starred float wraps at \textwidth, not \columnwidth -- rather than guessing which
	// blocks are full-width by name, typeset at BOTH engine-announced widths and let
	// whichever reproduces the page win. And a narrowed environment (an abstract) matches
	// NEITHER: extraCalVariants reads its true width/font/leading from the hint page's own
	// records. The winning variant's indent flag, width and font prefix ride on the cal so
	// edited re-typesets reproduce the same breaks. Per-variant line gap: a variant at
	// another font size has another leading, and rows must cluster at ITS gap, not the
	// body's.
	const base: { W: number; pre: string }[] = [{ W, pre: '' }];
	if (paper.textW > W + 2) base.push({ W: paper.textW, pre: '' });
	const learned = order.length ? extraCalVariants(paper, ctx.pageRecords(order[0])) : [];
	const variants: { lines: any[]; glyphs: any[]; indent: boolean; W: number; pre: string; calGap: number; gap: number }[] = [];
	for (const wv of [...base, ...learned]) {
		for (const ind of listItem ? [false] : [false, true]) {
			const cal = await ctx.typesetParagraph({ text: wv.pre + (ind ? INDENT_PREFIX : '') + orig, hsize: wv.W });
			if (!cal.ok) continue;
			const lines = cal.records.filter((x: any) => x.t === 'line');
			if (!lines.length || (cal.stats && (cal.stats as any).certified === false)) continue;
			const gs: number[] = [];
			for (let i = 1; i < lines.length; i++) gs.push((lines[i] as any).y - (lines[i - 1] as any).y);
			const cg = median(gs);
			variants.push({
				lines,
				glyphs: cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph'),
				indent: ind,
				W: wv.W,
				pre: wv.pre,
				calGap: cg,
				gap: cg || paper.blSkip || LINE_GAP_FALLBACK
			});
		}
	}
	if (!variants.length) return bail('cal-typeset-failed');
	const varRows = variants.map((v) => ({ ...v, rows: glyphRows(v.glyphs, v.gap) })).filter((v) => v.rows.length);
	if (!varRows.length) return bail('no-daemon-glyphs');
	const N = varRows[0].rows.length;
	const gap0 = varRows[0].gap;
	// tier 1: Nv contiguous rows matching a calibration variant, row for row. Pass 1 is
	// glyph-identical (can certify exact). Pass 2 tolerates digit-for-digit differences:
	// the daemon's counters are deterministic but not the page's (a second theorem, a
	// numbered equation), so a digit match is placement-true while the render differs --
	// always approx, and never by counter NAME (redefined/user-defined counters included).
	for (const rowEq of [sameCodepoints, sameCodepointsDigitTolerant]) {
		for (const pageNo of order) {
			if (ctx.rtlPage(pageNo)) continue; // record x-order is not the page's visual order here
			const recs = ctx.pageRecords(pageNo);
			const allG = recs.filter((x: any) => x.t === 'g');
			if (!allG.length) continue;
			for (const v of varRows) {
				for (const cw of columnWindows(recs, allG, v.W, G, paper.colSep)) {
					const colL = cw.colL,
						colR = cw.colR;
					const rows = glyphRows(
						allG.filter((x: any) => x.x >= colL && x.x <= colR),
						v.gap
					);
					const dRows = v.rows,
						Nv = dRows.length;
					// placement anchor: band left minus daemon left = the daemon box origin on the
					// page (see locateForward's paraLeft note)
					const dLeft = Math.min(...dRows.map((r) => r.left));
					const starts: { s: number; seam: boolean }[] = [];
					for (let s = 0; s + Nv <= rows.length; s++) {
						let okRun = true,
							seam = false;
						for (let i = 0; i < Nv && okRun; i++) {
							if (!rowEq(rows[s + i].cs, dRows[i].cs) || !sameOffsets(rows[s + i], dRows[i])) okRun = false;
							else if (i > 0) {
								// a big page gap breaks the run only when it exceeds the daemon's OWN
								// gap at this index by a line-height or more: interposed material is
								// never smaller than a line. Anything less is the env's internal
								// spacing (an abstract's heading skip, an inter-paragraph \parskip)
								// vertically adjusted by context the daemon's fresh box lacks
								// (\addvspace collapsing, flushbottom stretch) -- accept it, but a
								// magnitude mismatch means the splice renders daemon spacing:
								// legitimate placement, approx only.
								const pg = rows[s + i].y - rows[s + i - 1].y;
								const dgi = dRows[i].y - dRows[i - 1].y;
								if (pg > v.gap * ROW_BREAK) {
									if (pg - dgi > v.gap) okRun = false;
									else if (Math.abs(pg - dgi) > GLUE_GAP_TOL) seam = true;
								} else if (dgi > v.gap * ROW_BREAK && dgi - pg > GLUE_GAP_TOL) {
									// the mirror case: the daemon renders a skip the page collapsed --
									// placement is right, spacing is not: never certify exact
									seam = true;
								}
							}
						}
						if (okRun) starts.push({ s, seam });
					}
					if (starts.length > 1) return bail('ambiguous', { matches: starts.length, pageNo });
					if (starts.length === 1) {
						const { s, seam } = starts[0];
						const b1 = rows[s].y,
							bk = rows[s + Nv - 1].y;
						const paraLeft = Math.min(...rows.slice(s, s + Nv).map((r) => r.left)) - dLeft;
						const digits = rowEq !== sameCodepoints;
						const win = { medGap: v.gap, W: v.W, indent: v.indent, ...(v.pre ? { pre: v.pre } : {}) };
						// C2: natural band spacing -> exact. Stretched spacing (flushbottom
						// vertical justification) with content and x positions matching is still
						// the right paragraph in the right place: mark it approxStretch, which only a
						// full page-break certificate can render; otherwise the edit takes the full pass.
						if (v.calGap && Nv > 1) {
							const pg: number[] = [];
							for (let i = 1; i < Nv; i++) pg.push(rows[s + i].y - rows[s + i - 1].y);
							if (Math.abs(median(pg) - v.calGap) > GLUE_GAP_TOL) {
								ctx.emit('locate-glyph-stretched', { pageNo, b1, bk, N: Nv });
								return { pageNo, b1, bk, paraLeft, colL, colR, ...win, approx: true, approxStretch: true };
							}
						}
						ctx.emit(digits ? 'locate-glyph-digits' : 'locate-glyph-ok', { pageNo, b1, bk, N: Nv, indent: v.indent, seam });
						return {
							pageNo,
							b1,
							bk,
							paraLeft,
							colL,
							colR,
							...win,
							...(digits || seam ? { approx: true } : {}),
							...(seam && !digits ? { approxStretch: true } : {})
						};
					}
				}
			}
		}
	}
	const dRows = varRows[0].rows;
	const dLeft0 = Math.min(...dRows.map((r) => r.left));
	// tier 2: same glyphs, different breaks (indent shifts a line) -- slide a window of N+-1
	// contiguous rows and compare hyphen-stripped codepoint multisets. Hint pages only (the
	// multiset sweep is heavier than the early-exit exact compare).
	const HYPHENS = new Set([0x2d, 0xad, 0x2010]);
	const dAll: number[] = [];
	for (const r of dRows) for (const c of r.cs) if (!HYPHENS.has(c)) dAll.push(c);
	const dFreq = new Map<number, number>();
	for (const c of dAll) dFreq.set(c, (dFreq.get(c) || 0) + 1);
	const tol = Math.max(4, dAll.length * 0.02);
	type Fuzzy = { pageNo: number; b1: number; bk: number; left: number; colL: number; colR: number; diff: number; len: number };
	const found: Fuzzy[] = [];
	for (const pageNo of order.slice(0, Math.max(3, hintPages.length + 1))) {
		if (ctx.rtlPage(pageNo)) continue;
		const recs = ctx.pageRecords(pageNo);
		const allG = recs.filter((x: any) => x.t === 'g');
		if (!allG.length) continue;
		for (const cw of columnWindows(recs, allG, W, G, paper.colSep)) {
			const colL = cw.colL,
				colR = cw.colR;
			const rows = glyphRows(
				allG.filter((x: any) => x.x >= colL && x.x <= colR),
				gap0
			);
			for (const len of [N, N + 1, N - 1]) {
				if (len < 1) continue;
				for (let s = 0; s + len <= rows.length; s++) {
					let contiguous = true;
					for (let i = 1; i < len && contiguous; i++) if (rows[s + i].y - rows[s + i - 1].y > gap0 * ROW_BREAK) contiguous = false;
					if (!contiguous) continue;
					const freq = new Map<number, number>();
					let total = 0;
					for (let i = 0; i < len; i++)
						for (const c of rows[s + i].cs)
							if (!HYPHENS.has(c)) {
								freq.set(c, (freq.get(c) || 0) + 1);
								total++;
							}
					if (Math.abs(total - dAll.length) > tol) continue;
					let diff = 0;
					for (const [c, k] of dFreq) diff += Math.abs(k - (freq.get(c) || 0));
					for (const [c, k] of freq) if (!dFreq.has(c)) diff += k;
					if (diff <= tol)
						found.push({
							pageNo,
							b1: rows[s].y,
							bk: rows[s + len - 1].y,
							left: Math.min(...rows.slice(s, s + len).map((r) => r.left)) - dLeft0,
							colL,
							colR,
							diff,
							len
						});
				}
			}
		}
	}
	if (!found.length) return bail('not-on-page', { N });
	// windows of different lengths over the same paragraph overlap: group overlapping matches
	// and keep the best per group; >1 group = genuinely ambiguous. Same y-region, DIFFERENT
	// column candidate = still the same text (nested candidates from the cluster-min rule
	// window the same paragraph twice), so grouping ignores colL -- the lowest-diff member
	// (the window that lost no glyphs) wins.
	found.sort((a, b) => a.pageNo - b.pageNo || a.b1 - b.b1);
	const groups: Fuzzy[][] = [];
	for (const f of found) {
		const g = groups[groups.length - 1];
		if (g && g[0].pageNo === f.pageNo && f.b1 <= g[g.length - 1].bk + gap0) g.push(f);
		else groups.push([f]);
	}
	if (groups.length > 1) return bail('ambiguous', { matches: groups.length });
	const best = groups[0].sort((a, b) => a.diff - b.diff || Math.abs(a.len - N) - Math.abs(b.len - N))[0];
	ctx.emit('locate-glyph-approx', { pageNo: best.pageNo, b1: best.b1, bk: best.bk, len: best.len, N });
	return {
		pageNo: best.pageNo,
		b1: best.b1,
		bk: best.bk,
		medGap: gap0,
		paraLeft: best.left,
		W,
		colL: best.colL,
		colR: best.colR,
		...(varRows[0].pre ? { pre: varRows[0].pre } : {}),
		approx: true
	};
}
