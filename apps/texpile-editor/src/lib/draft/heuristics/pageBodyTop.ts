/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from '../geometry/geometry.types';

// Where a page's text area starts, read back from a page that HAS text.
//
// The page builder seats a column's first baseline max(\topskip, height) below the body top,
// so the body top is a page-geometry constant rather than anything about this page's content:
// measure it on a page the compile produced and it holds for a page it has not produced yet.
// That is what lets content leaving the last page be placed by the landing rule instead of
// guessed at.
//
// Paragraph lines at the COLUMN's own width only: a title block or a full-width figure spans
// \textwidth and starts higher than the body text does, and reading the body top off one puts
// every landed line too high. null when the page shows no such line, which refuses the hop
// rather than inventing a top for it.
export function pageBodyTop(recs: PageRecord[], colL: number, colR: number, W: number, topSkip: number): number | null {
	let first: { y: number; h: number } | null = null;
	for (const r of recs as any[]) {
		if (r.t !== 'pl' || r.h === undefined) continue;
		if (Math.abs(r.w - W) > 2 || r.x < colL || r.x > colR) continue;
		if (!first || r.y < first.y) first = { y: r.y, h: r.h };
	}
	return first ? first.y - Math.max(topSkip, first.h) : null;
}
