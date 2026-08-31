import { pageColumns } from '../geometry/pageColumns';
import { packsToGoal } from './packsToGoal';
import type { PageRecord } from '../geometry/geometry.types';

// Did the column content spills into fill its goal? That decides whether a capacity split's
// spacing is the engine's: tex.splitbox(..., "exactly") STRETCHES glue to reach the target,
// which reproduces the engine only where the engine also filled the column.
//
// The column box states it: glue order 0 means finite glue took up the slack, so the column
// packed to its goal; above 0 means a fil did, and an exact split would spread rows the page
// leaves at natural spacing.
//
// This used to be inferred from the page's glue records, and that over-refused badly. It
// scanned the WHOLE page, so one fil in the page furniture condemned every column on it: on a
// two-column fixture whose four columns include exactly one fil-terminated last column, the
// inference refused all four, and every push into that page tinted. The shipout box's own
// glue state cannot stand in either -- it reads 0 on every page of every fixture, because the
// output routine's vpack to \textheight lands one level in, on the column.
export function columnFills(recs: PageRecord[], colIndex: number | undefined): boolean {
	const cols = pageColumns(recs);
	const col = colIndex === undefined ? undefined : cols[colIndex];
	if (col?.gord !== undefined) return col.gord === 0;
	// no recorded column (multicol, a float page, an older bridge): the page-wide inference
	return packsToGoal(recs);
}

// Was that answer the COLUMN's own, or the page-wide stand-in? The inference is fine as a
// fallback for a render and not fine inside a certificate: picking the wrong reading spreads
// every row the split places. A wide table widens its column box, so the band's own width
// stops matching it -- which is how one page in a document silently loses column identity
// while its neighbours keep theirs.
export function columnKnown(recs: PageRecord[], colIndex: number | undefined): boolean {
	return colIndex !== undefined && pageColumns(recs)[colIndex]?.gord !== undefined;
}
