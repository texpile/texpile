/* eslint-disable @typescript-eslint/naming-convention -- TeX geometry shorthand: col L/R edges on pages A/B */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BP2PT } from '../texUnits';
import { INDENT_PREFIX } from '../daemonIndent';
import { COL_GUTTER, LINE_GAP_FALLBACK, ROW_BREAK } from '../heuristics/tolerances';
import { columnWindows } from '../heuristics/columnWindows';
import { glyphRows } from '../geometry/glyphRows';
import { median } from '../geometry/median';
import { sameCodepoints, sameOffsets } from '../geometry/rowEquality';
import type { Cal, CalBail, LocateContext } from './locate.types';

// Split locate: the paragraph's first nA lines END a column and the remaining nB lines
// OPEN a later one -- the next column of the SAME page (pA === pB, the two-column
// straddle) or a column of the next page. Both fragments are content-verified against
// the daemon reproduction (rows + x offsets), so a match can't land on the wrong text.
// The break row between the fragments is a first-order estimate -> always approx, so the
// edit takes the full pass.
export async function locateCrossPage(
	ctx: LocateContext,
	lineBoxes: any[],
	pA: number,
	pB: number,
	orig: string,
	listItem: boolean
): Promise<Cal | CalBail> {
	function bail(why: string, detail?: unknown): CalBail {
		ctx.emit('locate-xpage-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return { bail: why };
	}
	const paper = ctx.paper();
	if (ctx.rtlPage(pA) || ctx.rtlPage(pB)) return bail('page-rtl', { pA, pB });
	const samePage = pA === pB;
	const recsA = ctx.pageRecords(pA);
	const recsB = samePage ? recsA : ctx.pageRecords(pB);
	if (!recsA.length || !recsB.length) return bail('no-page-records');
	// \columnwidth is an engine register from the manifest; without it there is no
	// truthful hsize to reproduce line breaks at -- no invented default
	if (!(paper.colW > 0)) return bail('no-colwidth');
	const W = paper.colW;
	const G = COL_GUTTER;
	const variants: { glyphs: any[]; lines: any[]; indent: boolean }[] = [];
	for (const ind of listItem ? [false] : [false, true]) {
		const cal = await ctx.typesetParagraph({ text: (ind ? INDENT_PREFIX : '') + orig, hsize: W });
		if (!cal.ok) continue;
		const lines = cal.records.filter((x: any) => x.t === 'line');
		if (!lines.length || (cal.stats && (cal.stats as any).certified === false)) continue;
		const glyphs = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph');
		if (!glyphs.length) continue;
		variants.push({ glyphs, lines, indent: ind });
	}
	if (!variants.length) return bail('cal-typeset-failed');
	const calGaps: number[] = [];
	for (let i = 1; i < variants[0].lines.length; i++) calGaps.push((variants[0].lines[i] as any).y - (variants[0].lines[i - 1] as any).y);
	const gap = median(calGaps) || paper.blSkip || LINE_GAP_FALLBACK;
	const allGA = recsA.filter((x: any) => x.t === 'g');
	const allGB = recsB.filter((x: any) => x.t === 'g');
	if (!allGA.length || !allGB.length) return bail('no-page-glyphs');
	// prefer page A's synctex-anchored column, but fall back to every candidate
	const boxesA = lineBoxes.filter((b) => b.page === pA);
	const aMin = boxesA.length ? Math.min(...boxesA.map((b) => (b.bl ?? b.x) * BP2PT - paper.mx)) : null;
	const colsA = columnWindows(recsA, allGA, W, G, paper.colSep);
	if (aMin !== null) colsA.sort((a, b) => Math.abs(a.x - aMin) - Math.abs(b.x - aMin));
	// every start where dRows[off..off+len-1] matches `rows` contiguously, content and
	// x offsets both. No positional anchoring: a real column tail carries footnotes
	// below the fragment and a real column top carries [t]-floats above it, so the
	// fragments can sit ANYWHERE -- uniqueness of the match is the safety, not position
	function runsMatching(rows: { cs: number[]; xs: number[]; y: number }[], dRows: any[], off: number, len: number): number[] {
		const out: number[] = [];
		for (let s = 0; s + len <= rows.length; s++) {
			let ok = true;
			for (let i = 0; i < len && ok; i++) {
				if (!sameCodepoints(rows[s + i].cs, dRows[off + i].cs) || !sameOffsets(rows[s + i], dRows[off + i])) ok = false;
				else if (i > 0 && rows[s + i].y - rows[s + i - 1].y > gap * ROW_BREAK) ok = false;
			}
			if (ok) out.push(s);
		}
		return out;
	}
	for (const v of variants) {
		const dRows = glyphRows(v.glyphs, gap);
		const N = dRows.length;
		if (N < 2) continue;
		for (const cwA of colsA) {
			const clA = cwA.x;
			const colLA = cwA.colL,
				colRA = cwA.colR;
			const rowsA = glyphRows(
				allGA.filter((g: any) => g.x >= colLA && g.x <= colRA),
				gap
			);
			if (!rowsA.length) continue;
			for (const cwB of columnWindows(recsB, allGB, W, G, paper.colSep)) {
				const clB = cwB.x;
				// same page: the continuation can only open a LATER column of the reading order
				if (samePage && clB <= clA + G) continue;
				const colLB = cwB.colL,
					colRB = cwB.colR;
				const rowsB = glyphRows(
					allGB.filter((g: any) => g.x >= colLB && g.x <= colRB),
					gap
				);
				if (!rowsB.length) continue;
				// every split point whose two fragments both appear in their columns; more
				// than one distinct placement = repeated text, not provably this paragraph
				const cands: { nA: number; sA: number; sB: number }[] = [];
				for (let nA = 1; nA <= N - 1; nA++) {
					const sAs = runsMatching(rowsA, dRows, 0, nA);
					if (!sAs.length) continue;
					const sBs = runsMatching(rowsB, dRows, nA, N - nA);
					for (const sA of sAs) for (const sB of sBs) cands.push({ nA, sA, sB });
				}
				if (!cands.length) continue;
				if (cands.length > 1) {
					ctx.emit('locate-xpage-ambiguous', { pA, pB, matches: cands.length });
					continue;
				}
				const { nA, sA, sB } = cands[0];
				const nB = N - nA;
				const bandA = rowsA.slice(sA, sA + nA);
				const leftA = Math.min(...bandA.map((r) => r.left)) - Math.min(...dRows.slice(0, nA).map((r) => r.left));
				const bandB = rowsB.slice(sB, sB + nB);
				const leftB = Math.min(...bandB.map((r) => r.left)) - Math.min(...dRows.slice(nA).map((r) => r.left));
				ctx.emit('locate-xpage-ok', { pA, pB, nA, nB, indent: v.indent, samePage });
				return {
					pageNo: pA,
					b1: bandA[0].y,
					bk: bandA[nA - 1].y,
					medGap: gap,
					paraLeft: leftA,
					W,
					colL: colLA,
					colR: colRA,
					indent: v.indent,
					approx: true,
					spill: { pageNo: samePage ? undefined : pB, b1: bandB[0].y, bk: bandB[nB - 1].y, colL: colLB, colR: colRB, paraLeft: leftB }
				};
			}
		}
	}
	return bail('no-xpage-match');
}
