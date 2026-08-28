/* eslint-disable @typescript-eslint/no-explicit-any */
import { BP2PT } from '../texUnits';
import { columnWindows } from '../heuristics/columnWindows';
import { glyphRows } from '../geometry/glyphRows';
import { median } from '../geometry/median';
import { bandMatchesCalibration } from '../geometry/rowEquality';
import { BAND_EXTEND, COL_GUTTER, GLUE_GAP_TOL, LINE_GAP_FALLBACK, ROW_BREAK, ROW_CLUSTER, SPREAD_TOL } from '../heuristics/tolerances';
import { locateCrossPage } from './locateCrossPage';
import type { Cal, CalBail, LocateContext } from './locate.types';

// Forward path: synctex maps the paragraph's source line to its page boxes, snapped to the
// column baseline grid. Fast and exact when synctex tags the line boxes to line 1 (the common
// case). Anchor-related bails fall through to locateInverse.
export async function locateForward(
	ctx: LocateContext,
	file: string,
	line: number,
	orig: string,
	listItem = false
): Promise<Cal | CalBail> {
	function bail(why: string, detail?: unknown): CalBail {
		ctx.emit('locate-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return { bail: why };
	}
	const paper = ctx.paper();
	const sx: any = await ctx.synctex({ action: 'view', pdf: ctx.pdfPath(), tex: file, line, column: 0 });
	const boxes: any[] = (sx && sx.boxes) || [];
	const lineBoxes = boxes.filter((b) => (b.H || 0) < 30);
	if (!lineBoxes.length) return bail('no-line-boxes', { total: boxes.length, ok: sx?.ok, err: sx?.error });
	// F0: paragraph spans pages. Two CONSECUTIVE pages -> try the cross-page split locate
	// (band A ends page N's column, band B continues at a column top on page N+1); anything
	// wider or unmatched stays the recompile's job.
	const pagesSeen = [...new Set(lineBoxes.map((b) => b.page))].sort((a, b) => a - b);
	if (pagesSeen.length > 1) {
		if (pagesSeen.length === 2 && pagesSeen[1] === pagesSeen[0] + 1) {
			const xp = await locateCrossPage(ctx, lineBoxes, pagesSeen[0], pagesSeen[1], orig, listItem);
			if (!('bail' in xp)) return xp;
		}
		return bail('spans-pages', { pages: pagesSeen });
	}
	const pageNo = lineBoxes[0].page;
	if (ctx.rtlPage(pageNo)) return bail('page-rtl', { pageNo });
	const recs = ctx.pageRecords(pageNo);
	if (!recs.length) return bail('no-page-records', { pageNo });
	// the engine's exact \columnwidth (from the page compile manifest); calibrating the
	// daemon to this reproduces the page's line breaks. Fall back to the widest synctex
	// line box only if the manifest didn't carry it.
	const W = paper.colW > 0 ? paper.colW : Math.max(...lineBoxes.map((b) => b.W)) * BP2PT;
	const G = COL_GUTTER;
	const bys = [...new Set(lineBoxes.map((b) => +(b.y * BP2PT - paper.my).toFixed(1)))].sort((a, b) => a - b);
	const allG = recs.filter((x: any) => x.t === 'g');
	const cols = columnWindows(recs, allG, W, G, paper.colSep);
	if (!cols.length) return bail('no-columns');
	// The paragraph's column = the nearest column-left at or before the anchor's left edge.
	// Anchor by the synctex LINE BOX's own left (bl, exact; x sync-point as fallback), never
	// the leftmost glyph of that page ROW: on a grid-aligned two-column page the same row has
	// glyphs in BOTH columns, so a row minimum always lands in column 1 and every
	// right-column edit got measured against the left column's rows (spread/glue-gap
	// abandons on each keystroke).
	const aMin = Math.min(...lineBoxes.map((b) => (b.bl ?? b.x) * BP2PT - paper.mx));
	let col = cols[0];
	for (const c of cols) {
		if (c.x <= aMin + G) col = c;
		else break;
	}
	const colStart = col.x;
	const colL = col.colL,
		colR = col.colR;
	function inCol(x: number) {
		return x >= colL && x <= colR;
	}
	// raw column baselines with glyph counts. A visual TEXT LINE is a cluster of these:
	// math sub/superscripts and fraction bars sit on nearby baselines with few glyphs.
	const yCount = new Map<number, number>();
	for (const x of allG)
		if (inCol(x.x)) {
			const y = +x.y.toFixed(1);
			yCount.set(y, (yCount.get(y) || 0) + 1);
		}
	const rawYs = [...yCount.keys()].sort((a, b) => a - b);
	// C1 calibration: the daemon must reproduce the UNEDITED paragraph exactly --
	// verifies fonts/size/indent/macros empirically (same engine, so if the unedited
	// text reproduces, the edited text is exact too)
	const cal = await ctx.typesetParagraph({ text: orig, hsize: W });
	if (!cal.ok) return bail('cal-typeset-failed');
	const calLines = cal.records.filter((x: any) => x.t === 'line');
	// zero lines = the paragraph typesets to NOTHING (\eat, \footnotetext, bare state
	// commands): that is cal-empty (invisible), not an uncertifiable construct
	if (!calLines.length) return bail('cal-empty', { lines: 0 });
	if (cal.stats && (cal.stats as any).certified === false) return bail('cal-uncertified', { certified: false });
	// a zero-glyph reproduction (a float's content is discarded in the daemon's box) can
	// never certify a splice -- it would erase the region with blankness
	if (!cal.records.some((x: any) => x.t === 'g' || x.t === 'glyph')) return bail('cal-empty');
	const N = calLines.length;
	// line gap = the daemon's NATURAL body line gap. Robust; the whole column's median is
	// polluted on sparse pages (title/heading gaps between few baselines).
	const calGaps: number[] = [];
	for (let i = 1; i < calLines.length; i++) calGaps.push((calLines[i] as any).y - (calLines[i - 1] as any).y);
	const calGap = median(calGaps);
	// snapping tolerance; a 1-line orig has no calGap, so fall back to the smallest
	// recurring column gap, then a default
	let gap = calGap;
	if (!gap) {
		const cg: number[] = [];
		for (let i = 1; i < rawYs.length; i++) {
			const g = rawYs[i] - rawYs[i - 1];
			if (g > 2 && g < 20) cg.push(g);
		}
		gap = cg.length ? Math.min(...cg) : paper.blSkip || LINE_GAP_FALLBACK;
	}
	// collapse each cluster of nearby baselines (consecutive gap < ~0.45*gap) to ONE
	// text-line baseline -- the cluster member with the MOST glyphs (the main run of
	// text, not a super/subscript). So a math paragraph counts one baseline per visual
	// line instead of extra ones from `_i`/`^n`/fraction bars.
	const colBase: number[] = [];
	for (let i = 0; i < rawYs.length;) {
		let j = i,
			rep = rawYs[i],
			repC = yCount.get(rawYs[i]) as number;
		while (j + 1 < rawYs.length && rawYs[j + 1] - rawYs[j] <= gap * ROW_CLUSTER) {
			j++;
			const c = yCount.get(rawYs[j]) as number;
			if (c > repC) {
				repC = c;
				rep = rawYs[j];
			}
		}
		colBase.push(rep);
		i = j + 1;
	}
	// use N (the daemon's exact line count) to DEFINE the band: snap the synctex
	// baselines to the column grid, then take exactly N contiguous baselines covering
	// them. Exact, instead of heuristic snapping that grabbed neighbouring paragraphs.
	function idxOf(y: number) {
		let bi = -1,
			bd = 1e9;
		for (let i = 0; i < colBase.length; i++) {
			const d = Math.abs(colBase[i] - y);
			if (d < bd) {
				bd = d;
				bi = i;
			}
		}
		return bd <= gap * 0.5 ? bi : -1;
	}
	const idxs = bys.map(idxOf).filter((i) => i >= 0);
	if (!idxs.length) return bail('anchor-off-grid');
	let lo = Math.min(...idxs),
		hi = Math.max(...idxs);
	if (hi - lo + 1 > N) return bail('synctex-span>N', { span: hi - lo + 1, N }); // spans / fragmented
	let need = N - (hi - lo + 1);
	while (need > 0 && hi + 1 < colBase.length && colBase[hi + 1] - colBase[hi] <= gap * BAND_EXTEND) {
		hi++;
		need--;
	}
	while (need > 0 && lo - 1 >= 0 && colBase[lo] - colBase[lo - 1] <= gap * BAND_EXTEND) {
		lo--;
		need--;
	}
	if (need > 0) return bail('spans-boundary', { N, got: hi - lo + 1 }); // runs off the column
	for (let i = lo; i < hi; i++) if (colBase[i + 1] - colBase[i] > gap * ROW_BREAK) return bail('break-inside');
	const b1 = colBase[lo],
		bk = colBase[hi];
	// paraLeft = where the daemon BOX ORIGIN sits on the page: the band's observed left
	// minus the daemon's own left for the same content. Both engine-measured, so content
	// that carries its own offset (list indent, \centering'd tabular, equation) recovers
	// the true galley origin and an edited re-typeset re-centers itself; box-anchored
	// prose (daemon left ~0) reduces to the band left.
	const band = allG.filter((x: any) => inCol(x.x) && x.y >= b1 - 0.5 && x.y <= bk + 0.5);
	const bandLeft = band.length ? Math.min(...band.map((x: any) => x.x)) : colStart;
	const dGl = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph');
	const dLeft = dGl.length ? Math.min(...dGl.map((x: any) => x.x as number)) : 0;
	const paraLeft = bandLeft - dLeft;
	const calSpread = (calLines[calLines.length - 1] as any).y - (calLines[0] as any).y;
	if (Math.abs(calSpread - (bk - b1)) > SPREAD_TOL)
		return bail('spread', { calSpread: +calSpread.toFixed(1), pageSpread: +(bk - b1).toFixed(1) });
	// C2: the paragraph's OWN line spacing on the page must be natural (not glue-stretched
	// by vertical justification), else a rigid shift won't match TeX's redistribution.
	// Measure within the band, not the whole column; skip a single line (nothing to stretch).
	if (calGap) {
		const bandYs = colBase.filter((y) => y >= b1 - 0.5 && y <= bk + 0.5);
		const pageGaps: number[] = [];
		for (let i = 1; i < bandYs.length; i++) pageGaps.push(bandYs[i] - bandYs[i - 1]);
		const pageGap = median(pageGaps);
		if (pageGap && Math.abs(pageGap - calGap) > GLUE_GAP_TOL)
			return bail('glue-gap', { pageGap: +pageGap.toFixed(2), calGap: +calGap.toFixed(2) });
	}
	// content verification: the band must BE this paragraph (same glyphs, same offsets), not
	// merely a same-shaped one. Multi-file synctex misresolution (fragment paths, \par
	// attributed to the main file's \input line, file-local line collisions) can land on an
	// unrelated paragraph that passes every geometry check -- and a patch there would splice
	// the edit over the wrong content. Mismatch falls through to the glyph-fingerprint tier,
	// which searches by content.
	const bandRows = glyphRows(
		allG.filter((g: any) => inCol(g.x) && g.y >= b1 - 0.5 && g.y <= bk + 0.5),
		gap
	);
	const dRows = glyphRows(
		cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph'),
		gap
	);
	if (!dRows.length || !bandMatchesCalibration(bandRows, dRows))
		return bail('content-mismatch', { band: bandRows.length, cal: dRows.length });
	return { pageNo, b1, bk, medGap: gap, paraLeft, W, colL, colR };
}
