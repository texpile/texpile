/* eslint-disable @typescript-eslint/no-explicit-any */
import { COL_GUTTER, GLUE_GAP_TOL, LINE_GAP_FALLBACK, ROW_BREAK, SPREAD_TOL } from '../heuristics/tolerances';
import { INDENT_PREFIX } from '../daemonIndent';
import { bandFontPrefix } from './bandFont';
import { bandWindow } from '../geometry/bandWindow';
import { columnWindows } from '../heuristics/columnWindows';
import { glyphRows } from '../geometry/glyphRows';
import { median } from '../geometry/median';
import { bandMatchesCalibration } from '../geometry/rowEquality';
import { sourceBand } from './sourceBand';
import type { Cal, CalBail, LocateContext } from './locate.types';

// The paragraph, asked rather than searched. Each paragraph stamps its own first source line
// onto the nodes it produces, so the lines carrying this edit's line number ARE the band --
// no synctex call, no baseline-grid snapping, no calibration sweep over every column of
// every page.
//
// It still has to be PROVEN: the claim says where the engine put line N's content, not that
// this band is the text we are about to splice. So the daemon reproduces the paragraph and
// the glyphs must match, exactly as the other tiers require. That is also what makes the
// known gap safe -- a list item's stamp points at the PREVIOUS item, whose content then
// fails to match, and the caller falls through to the search tiers.
export async function locateBySource(
	ctx: LocateContext,
	file: string,
	line: number,
	endLine: number,
	orig: string
): Promise<Cal | CalBail> {
	function bail(why: string, detail?: unknown): CalBail {
		ctx.emit('locate-source-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return { bail: why };
	}
	const paper = ctx.paper();
	if (!paper.srcFiles?.length) return bail('no-source-map');
	const found = sourceBand(ctx, paper.srcFiles, file, line, endLine);
	if ('bail' in found) return bail(found.bail, found.detail);
	const { pageNo, lines } = found;
	if (ctx.rtlPage(pageNo)) return bail('page-rtl', { pageNo });

	// hsize comes from the band's own pl records: the width the engine actually broke these
	// lines at, so a narrowed environment needs no variant search to be found. Snapped to an
	// announced width when it is one, so the calibration this tier asks for is the SAME
	// request the later tiers make and they share one answer instead of paying twice.
	const raw = median(lines.map((l) => l.w));
	if (!(raw > 0)) return bail('no-width');
	const W = [paper.colW, paper.textW].find((k) => k > 0 && Math.abs(k - raw) <= 0.5) ?? raw;
	const recs = ctx.pageRecords(pageNo);
	const allG = recs.filter((x: any) => x.t === 'g');
	if (!allG.length) return bail('no-page-glyphs');
	const col = columnWindows(recs, allG, W, COL_GUTTER, paper.colSep).find((c) => lines[0].x >= c.colL && lines[0].x <= c.colR);
	if (!col) return bail('no-column', { x: lines[0].x });

	function bandGlyphs(gap: number) {
		const y = bandWindow(lines[0].y, lines[lines.length - 1].y, gap);
		return allG.filter((g: any) => g.x >= col!.colL && g.x <= col!.colR && g.y >= y.top && g.y <= y.bottom);
	}
	// TeX indents every paragraph but the first of a section, and the daemon's box is
	// \noindent, so an indented paragraph breaks its first line differently. Read which it is
	// off the band -- an indented first row starts further right than the rest -- and ask for
	// that one; the other is the fallback, and costs nothing when it is already the answer.
	const probeRows = glyphRows(bandGlyphs(paper.blSkip || LINE_GAP_FALLBACK), paper.blSkip || LINE_GAP_FALLBACK);
	const indented = probeRows.length > 1 && probeRows[0].left > Math.min(...probeRows.slice(1).map((r) => r.left)) + 2;
	// and the same question about the FONT, asked only when it has to be. A footnote, an
	// abstract or a quote runs at its own size and leading, and the daemon's body-size box
	// breaks it to a different number of lines -- but body text is almost every band, so the
	// plain box goes first and is the only typeset paid for. The band's own measured size is
	// the second wave, reached only when no plain variant reproduced the page's line count.
	let cal: any = null;
	let indent = false;
	let pre = '';
	for (let wave = 0; wave < 2 && !cal; wave++) {
		const p = wave === 0 ? '' : bandFontPrefix(recs, lines);
		if (wave === 1 && !p) break;
		for (const ind of indented ? [true, false] : [false, true]) {
			const c = await ctx.typesetParagraph({ text: p + (ind ? INDENT_PREFIX : '') + orig, hsize: W });
			if (!c.ok) continue;
			const cl = c.records.filter((x: any) => x.t === 'line');
			if (!cl.length || (c.stats && (c.stats as any).certified === false)) continue;
			if (!c.records.some((x: any) => x.t === 'g' || x.t === 'glyph')) continue;
			// the daemon breaking to a different number of lines than the page did means the splice
			// would not reproduce this band; the search tiers own that case
			if (cl.length !== lines.length) continue;
			cal = c;
			indent = ind;
			pre = p;
			break;
		}
	}
	if (!cal) return bail('no-matching-cal', { pageLines: lines.length });
	const calLines = cal.records.filter((x: any) => x.t === 'line');
	const dGl = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph');

	const calGaps: number[] = [];
	for (let i = 1; i < calLines.length; i++) calGaps.push((calLines[i] as any).y - (calLines[i - 1] as any).y);
	const calGap = median(calGaps);
	const gap = calGap || paper.blSkip || LINE_GAP_FALLBACK;
	const b1 = lines[0].y,
		bk = lines[lines.length - 1].y;
	// a gap inside the band bigger than a line means material sits BETWEEN these lines that
	// the daemon's fresh box does not have; a rigid splice there would paint over it
	for (let i = 1; i < lines.length; i++) if (lines[i].y - lines[i - 1].y > gap * ROW_BREAK) return bail('break-inside');

	const bandRows = glyphRows(bandGlyphs(gap), gap);
	const dRows = glyphRows(dGl, gap);
	if (!dRows.length || !bandMatchesCalibration(bandRows, dRows))
		return bail('content-mismatch', { band: bandRows.length, cal: dRows.length });

	const paraLeft = Math.min(...bandRows.map((r) => r.left)) - Math.min(...dRows.map((r) => r.left));
	// spacing decides EXACT vs provisional, the same test the other tiers apply: matching
	// content at stretched spacing is the right paragraph rendered at the wrong leading
	const calSpread = (calLines[calLines.length - 1] as any).y - (calLines[0] as any).y;
	const stretched =
		Math.abs(calSpread - (bk - b1)) > SPREAD_TOL ||
		(!!calGap && lines.length > 1 && Math.abs(median(lines.slice(1).map((l, i) => l.y - lines[i].y)) - calGap) > GLUE_GAP_TOL);
	ctx.emit(stretched ? 'locate-source-stretched' : 'locate-source-ok', {
		pageNo,
		b1,
		bk,
		n: lines.length,
		W: +W.toFixed(2),
		...(pre ? { pre: 1 } : {})
	});
	return {
		pageNo,
		b1,
		bk,
		medGap: gap,
		paraLeft,
		W,
		colL: col.colL,
		colR: col.colR,
		...(col.i === undefined ? {} : { col: col.i }),
		...(pre ? { pre } : {}),
		indent,
		...(stretched ? { approx: true, approxStretch: true } : {})
	};
}
