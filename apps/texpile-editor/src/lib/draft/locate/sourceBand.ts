/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LocateContext } from './locate.types';

export type SourceLine = { x: number; y: number; w: number };
export type SourceBandResult = { pageNo: number; lines: SourceLine[] } | { bail: string; detail?: unknown };

// The page lines the compile attributed to this stretch of source, as one contiguous run.
//
// Matching is by BASENAME: the stamp records the file the engine was reading, which is the
// name it was \input by, while the caller holds a workspace path.
//
// More than one page carrying the range is a straddle, and this tier refuses it -- the
// cross-page tier owns that, and it needs the split point rather than the union. A range
// that lands twice on the same page is repeated content the stamp cannot separate.
export function sourceBand(ctx: LocateContext, srcFiles: string[], file: string, line: number, endLine: number): SourceBandResult {
	const want = file.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
	const ids = srcFiles.map((f, i) => (f.toLowerCase() === want ? i + 1 : 0)).filter(Boolean);
	if (!ids.length) return { bail: 'file-not-stamped', detail: { want } };
	const byPage = new Map<number, SourceLine[]>();
	for (const p of ctx.pageNumbers()) {
		const hits: SourceLine[] = [];
		for (const r of ctx.pageRecords(p) as any[]) {
			if (r.t !== 'pl' || r.s === undefined) continue;
			if (r.s < line || r.s > endLine) continue;
			if (r.sf !== undefined && !ids.includes(r.sf)) continue;
			hits.push({ x: r.x, y: r.y, w: r.w });
		}
		if (hits.length) byPage.set(p, hits);
	}
	if (!byPage.size) return { bail: 'no-source-records', detail: { line, endLine } };
	if (byPage.size > 1) return { bail: 'spans-pages', detail: { pages: [...byPage.keys()] } };
	const [pageNo, lines] = [...byPage.entries()][0];
	lines.sort((a, b) => a.y - b.y);
	// records are emitted in reading order per column, so a single column's run is contiguous
	// in y; two columns of the same page produce two clusters in x
	const cols = [...new Set(lines.map((l) => Math.round(l.x)))];
	if (cols.length > 1) return { bail: 'spans-columns', detail: { cols } };
	return { pageNo, lines };
}
