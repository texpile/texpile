import { sourceFragments } from './sourceFragments';
import type { LocateContext } from './locate.types';
import type { SourceLine } from './sourceFragments';

export type { SourceLine } from './sourceFragments';
export type SourceBandResult = { pageNo: number; lines: SourceLine[] } | { bail: string; detail?: unknown };

// The single-column reading of the stamp: one contiguous run, or a named straddle. The split
// tier owns the straddle, so the bail says WHICH kind it is rather than just refusing.
export function sourceBand(ctx: LocateContext, srcFiles: string[], file: string, line: number, endLine: number): SourceBandResult {
	const found = sourceFragments(ctx, srcFiles, file, line, endLine);
	if ('bail' in found) return found;
	const { frags } = found;
	if (frags.length > 1) {
		const pages = [...new Set(frags.map((f) => f.pageNo))];
		return pages.length > 1
			? { bail: 'spans-pages', detail: { pages } }
			: { bail: 'spans-columns', detail: { cols: frags.map((f) => Math.round(f.lines[0].x)) } };
	}
	return { pageNo: frags[0].pageNo, lines: frags[0].lines };
}
