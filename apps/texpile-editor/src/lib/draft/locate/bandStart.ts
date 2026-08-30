import { sourceFragments } from './sourceFragments';
import type { LocateContext } from './locate.types';

// Where a block's typeset output actually begins.
//
// A block's leading source lines need not produce galley of their own. `\centerline{...}`
// makes a plain \hbox, which is not a paragraph line and emits no `pl`; a \label or a comment
// makes nothing at all. The page therefore has one fewer row than the block has been assumed
// to own, while the daemon reproducing the block as a paragraph counts that line in -- so its
// rows sit one out from the page's and every row below the heading renders a baseline high.
// Measured on the kerr fixture, whose abstract is `\centerline{Abstract}` with the paragraph
// glued to it: 12pt, with the first row landing exactly right.
//
// The engine already says which source line each galley line came from, so this is a lookup:
// the band starts at the first line in the range that produced one. `line` unchanged when the
// range is unstamped or the first line already produced galley -- narrowing only ever moves
// the start forward, and never past the end.
export function bandStartLine(ctx: LocateContext, file: string, line: number, endLine: number): number {
	const srcFiles = ctx.paper().srcFiles;
	if (!srcFiles?.length || endLine <= line) return line;
	const found = sourceFragments(ctx, srcFiles, file.replace(/\\/g, '/'), line, endLine);
	if ('bail' in found) return line;
	let first = Infinity;
	for (const f of found.frags) for (const s of f.stamps) if (s < first) first = s;
	return first > line && first <= endLine ? first : line;
}
