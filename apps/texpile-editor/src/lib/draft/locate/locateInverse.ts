/* eslint-disable @typescript-eslint/naming-convention -- TeX geometry shorthand for the inverse-locate deltas */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BP2PT } from '../texUnits';
import { COL_GUTTER, GLUE_GAP_TOL, LINE_GAP_FALLBACK, ROW_BREAK, ROW_CLUSTER, SPREAD_TOL } from '../heuristics/tolerances';
import { columnWindows } from '../heuristics/columnWindows';
import { median } from '../geometry/median';
import type { Cal, CalBail, LocateContext } from './locate.types';

// Inverse fallback for when the forward path can't anchor: synctex often tags a paragraph's
// LINE boxes to the line that triggers its \par (the blank line after it, or \end{document}
// for the last paragraph), not line 1 -- so forward(line 1) returns the wrong region (e.g. a
// centered \maketitle above it) or nothing. Instead, ask synctex which source line each page
// baseline came FROM (edit/inverse), keep the baselines whose source line is in the paragraph's
// [line, endLine+1] range (its \par line included), and pick the contiguous run of exactly N
// baselines whose glyph count matches the daemon's -- which rejects the centered title run and
// the 1-glyph footer that also carry the \par line's tag. One synctex edit per candidate
// baseline, windowed to the forward hint and run only on the (cached, rare) fallback.
export async function locateInverse(ctx: LocateContext, file: string, line: number, endLine: number, orig: string): Promise<Cal | CalBail> {
	function bail(why: string, detail?: unknown): CalBail {
		ctx.emit('locate-inverse-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return { bail: why };
	}
	const paper = ctx.paper();
	const pdf = ctx.pdfPath();
	async function fwd(ln: number): Promise<any[]> {
		return (((await ctx.synctex({ action: 'view', pdf, tex: file, line: ln, column: 0 })) as any)?.boxes as any[]) || [];
	}
	let boxes = await fwd(line);
	if (!boxes.length) boxes = await fwd(endLine + 1);
	if (!boxes.length) return bail('no-synctex-page');
	const pageNo = boxes[0].page;
	if (ctx.rtlPage(pageNo)) return bail('page-rtl', { pageNo });
	const recs = ctx.pageRecords(pageNo);
	if (!recs.length) return bail('no-page-records');
	const allG = recs.filter((x: any) => x.t === 'g');
	if (!allG.length) return bail('no-page-glyphs');
	const W = paper.colW > 0 ? paper.colW : Math.max(...boxes.map((b) => b.W)) * BP2PT;
	const G = COL_GUTTER;
	const cal = await ctx.typesetParagraph({ text: orig, hsize: W });
	if (!cal.ok) return bail('cal-typeset-failed');
	const calLines = cal.records.filter((x: any) => x.t === 'line');
	if (!calLines.length || (cal.stats && (cal.stats as any).certified === false)) return bail('cal-uncertified');
	const N = calLines.length;
	const Gd = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph').length; // daemon glyph count
	if (!Gd) return bail('cal-empty'); // float/discarded content renders no glyphs; nothing to match
	const calGaps: number[] = [];
	for (let i = 1; i < calLines.length; i++) calGaps.push((calLines[i] as any).y - (calLines[i - 1] as any).y);
	const calGap = median(calGaps);
	const gap = calGap || paper.blSkip || LINE_GAP_FALLBACK;
	// window the inverse mapping to the forward hint (the paragraph's own box is tagged to
	// line 1, so its y is here even when the line boxes aren't): bounds the synctex edit calls
	// and drops a far-away footer/header from the candidate set
	const fwdYs = boxes.map((b) => b.y * BP2PT - paper.my);
	const winLo = Math.min(...fwdYs) - 5 * gap,
		winHi = Math.max(...fwdYs) + (N + 5) * gap;
	const cols = columnWindows(recs, allG, W, G, paper.colSep);
	type Run = { col: number; colL: number; colR: number; len: number; gcount: number; b1: number; bk: number; left: number };
	const runs: Run[] = [];
	for (const cw of cols) {
		const cl = cw.x;
		const colL = cw.colL;
		const colR = cw.colR;
		function inCol(x: number) {
			return x >= colL && x <= colR;
		}
		const yc = new Map<number, number>();
		for (const x of allG)
			if (inCol(x.x)) {
				const y = +x.y.toFixed(1);
				yc.set(y, (yc.get(y) || 0) + 1);
			}
		const rawYs = [...yc.keys()].sort((a, b) => a - b);
		const base: number[] = [],
			cnt: number[] = [],
			left: number[] = [];
		for (let i = 0; i < rawYs.length;) {
			let j = i,
				rep = rawYs[i],
				rc = yc.get(rawYs[i]) as number;
			while (j + 1 < rawYs.length && rawYs[j + 1] - rawYs[j] <= gap * ROW_CLUSTER) {
				j++;
				const c = yc.get(rawYs[j]) as number;
				if (c > rc) {
					rc = c;
					rep = rawYs[j];
				}
			}
			const cys = rawYs.slice(i, j + 1),
				gls = allG.filter((x: any) => inCol(x.x) && cys.includes(+x.y.toFixed(1)));
			base.push(rep);
			cnt.push(gls.length);
			left.push(gls.length ? Math.min(...gls.map((x: any) => x.x)) : cl);
			i = j + 1;
		}
		// inverse-map every in-window baseline concurrently -> its source line. The line
		// number is only meaningful within the EDITED file: in a multi-file project every
		// fragment has a "line 45", so a hit from another file must not count.
		const wantBase = file.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
		const src: (number | null)[] = await Promise.all(
			base.map(async (y, i) => {
				if (y < winLo || y > winHi) return null;
				const ex: any = await ctx.synctex({
					action: 'edit',
					pdf,
					page: pageNo,
					x: (left[i] + 3 + paper.mx) / BP2PT,
					y: (y + paper.my) / BP2PT
				});
				if (!ex?.ok) return null;
				const inpBase = String(ex.input || '')
					.replace(/\\/g, '/')
					.split('/')
					.pop()!
					.toLowerCase();
				if (inpBase && inpBase !== wantBase) return null;
				return ex.line as number;
			})
		);
		for (let i = 0; i < base.length;) {
			function inRange(k: number) {
				return src[k] != null && (src[k] as number) >= line && (src[k] as number) <= endLine + 1;
			}
			if (!inRange(i)) {
				i++;
				continue;
			}
			let j = i;
			while (j + 1 < base.length && inRange(j + 1) && base[j + 1] - base[j] <= gap * ROW_BREAK) j++;
			runs.push({
				col: cl,
				colL,
				colR,
				len: j - i + 1,
				gcount: cnt.slice(i, j + 1).reduce((s, c) => s + c, 0),
				b1: base[i],
				bk: base[j],
				left: Math.min(...left.slice(i, j + 1))
			});
			i = j + 1;
		}
	}
	// an exact run must carry the daemon's glyph count too -- a same-line-count region with
	// different content is a different piece of the page, not this paragraph
	const exact = runs.filter((r) => r.len === N && Math.abs(r.gcount - Gd) <= Math.max(4, Gd * 0.02));
	if (!exact.length) {
		// two partial runs in DIFFERENT columns adding up to N (with the daemon's glyph count)
		// = the paragraph straddles a column break: return a SPLIT cal (first part + spill)
		// so the caller can name the honest reason (spans-boundary) when it refuses
		for (const a of runs)
			for (const b of runs) {
				if (a.col === b.col) continue;
				if (Math.abs(a.len + b.len - N) <= 1 && Math.abs(a.gcount + b.gcount - Gd) <= Gd * 0.15) {
					const [first, second] = a.col < b.col ? [a, b] : [b, a];
					ctx.emit('locate-inverse-span', { N, split: [first.len, second.len], pageNo });
					return {
						pageNo,
						b1: first.b1,
						bk: first.bk,
						medGap: gap,
						paraLeft: first.left,
						W,
						colL: first.colL,
						colR: first.colR,
						approx: true,
						spill: { b1: second.b1, bk: second.bk, colL: second.colL, colR: second.colR, paraLeft: second.left }
					};
				}
			}
		// a run whose GLYPHS match the daemon almost exactly but whose line count is off by
		// one (\noindent calibration vs an indented page paragraph): the right place, an
		// inexact break. Take it as an APPROX cal -- the caller refuses it (approx-locate)
		// unless a narrowed retry locates exactly, but the locate names the right paragraph.
		const fuzzy = runs.filter((r) => Math.abs(r.len - N) <= 1 && Math.abs(r.gcount - Gd) <= Math.max(4, Gd * 0.02));
		if (fuzzy.length) {
			fuzzy.sort((a, b) => Math.abs(a.gcount - Gd) - Math.abs(b.gcount - Gd));
			const f = fuzzy[0];
			ctx.emit('locate-inverse-approx', { pageNo, b1: f.b1, bk: f.bk, len: f.len, N, gcount: f.gcount, Gd });
			return { pageNo, b1: f.b1, bk: f.bk, medGap: gap, paraLeft: f.left, W, colL: f.colL, colR: f.colR, approx: true };
		}
		return bail('no-run-of-N', { N, runs: runs.map((r) => ({ len: r.len, g: r.gcount })) });
	}
	exact.sort((a, b) => Math.abs(a.gcount - Gd) - Math.abs(b.gcount - Gd));
	const best = exact[0];
	const b1 = best.b1,
		bk = best.bk;
	const calSpread = (calLines[calLines.length - 1] as any).y - (calLines[0] as any).y;
	if (Math.abs(calSpread - (bk - b1)) > SPREAD_TOL)
		return bail('spread', { calSpread: +calSpread.toFixed(1), pageSpread: +(bk - b1).toFixed(1) });
	if (calGap) {
		function inColB(x: number) {
			return x >= best.colL && x <= best.colR;
		}
		const bys = [
			...new Set(allG.filter((x: any) => inColB(x.x) && x.y >= b1 - 0.5 && x.y <= bk + 0.5).map((x: any) => +(x.y as number).toFixed(1)))
		].sort((a, b) => a - b);
		const pg: number[] = [];
		for (let i = 1; i < bys.length; i++) pg.push(bys[i] - bys[i - 1]);
		const pageGap = median(pg);
		if (pageGap && Math.abs(pageGap - calGap) > GLUE_GAP_TOL)
			return bail('glue-gap', { pageGap: +pageGap.toFixed(2), calGap: +calGap.toFixed(2) });
	}
	ctx.emit('locate-inverse-ok', { pageNo, b1, bk, N, gcount: best.gcount, Gd });
	const invDGl = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph');
	const invDLeft = invDGl.length ? Math.min(...invDGl.map((x: any) => x.x as number)) : 0;
	const paraLeft = best.left - invDLeft;
	// the inverse evidence is counts + attributions, never per-glyph content (that's the
	// glyph tier, which runs FIRST and already failed if we're here) -- so its result is
	// close-enough, not provable: approx, refused unless a narrowed retry locates exactly
	return { pageNo, b1, bk, medGap: gap, paraLeft, W, colL: best.colL, colR: best.colR, approx: true };
}
