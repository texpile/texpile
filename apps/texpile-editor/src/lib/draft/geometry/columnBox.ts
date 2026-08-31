import { pageColumns, type PageColumn } from './pageColumns';
import type { PageRecord } from './geometry.types';

// The column a match window belongs to, by CONTAINMENT: a window is its own box padded
// outward and never reaches a neighbour's. The index a window carries cannot stand in --
// it counts only columns of the REQUESTED width, so a page holding a full-width box
// alongside its \columnwidth ones numbers the two lists differently.
export function columnBox(recs: PageRecord[], colL: number, colR: number): PageColumn | undefined {
	return pageColumns(recs).find((c) => c.x >= colL - 1 && c.x + c.w <= colR + 1);
}
