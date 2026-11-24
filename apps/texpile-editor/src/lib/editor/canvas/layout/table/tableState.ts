import type { LayoutBox, LayoutBoxBuilder } from '../../contracts/layoutTypes';
import type { CollapsedBorderSegment } from './tableBorders';

const columnWidthsByTable = new WeakMap<LayoutBox, readonly number[]>();
const segmentsByTable = new WeakMap<LayoutBox, readonly CollapsedBorderSegment[]>();

export function keepColumnWidths(table: LayoutBoxBuilder, widths: readonly number[]): void {
	columnWidthsByTable.set(table as LayoutBox, widths);
}

/** the laid-out widths of a table box's columns, for captureColumnWidths and view.canvas.columnWidths */
export function tableColumnWidths(table: LayoutBox): readonly number[] | null {
	return columnWidthsByTable.get(table) ?? null;
}

export function keepCollapsedSegments(table: LayoutBoxBuilder, segments: readonly CollapsedBorderSegment[]): void {
	if (segments.length) segmentsByTable.set(table as LayoutBox, segments);
}

/** the collapsed borders the table box draws, set when it was laid out */
export function collapsedBordersOf(table: LayoutBox): readonly CollapsedBorderSegment[] {
	return segmentsByTable.get(table) ?? [];
}

/** a copy of a laid-out table box keeps what its layout recorded */
export function carryTableState(from: LayoutBox, to: LayoutBox): void {
	const widths = columnWidthsByTable.get(from);
	if (widths) columnWidthsByTable.set(to, widths);
	const segments = segmentsByTable.get(from);
	if (segments) segmentsByTable.set(to, segments);
}
