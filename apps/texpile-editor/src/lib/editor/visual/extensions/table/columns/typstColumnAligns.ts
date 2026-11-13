// a Typst table's align: as one value per column, and back
import { horizontalAlignment, withHorizontal } from '$lib/languages/typst/visual/extensions/layout/layoutDrawing';

export type ColumnSide = 'left' | 'center' | 'right';

const UNSAID = 'auto';
const SIDE_OF: Record<string, ColumnSide> = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right' };

/** each column's align as written, auto for one that says nothing; null for a function or a list of another length */
export function columnAligns(align: string | null, columns: number): string[] | null {
	const value = (align ?? '').trim();
	if (!value) return Array.from({ length: columns }, () => UNSAID);
	if (/=>|[[\]{}]/.test(value)) return null;
	if (!value.startsWith('(')) return /[(),]/.test(value) ? null : Array.from({ length: columns }, () => value);
	if (!value.endsWith(')') || /[()]/.test(value.slice(1, -1))) return null;
	const each = value
		.slice(1, -1)
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	return each.length === columns ? each : null;
}

/** null for a column that takes the side of the text around the table */
export function sideOfAlign(align: string): ColumnSide | null {
	return SIDE_OF[horizontalAlignment(align) ?? ''] ?? null;
}

/** what `align:` holds for these columns: one value when they agree, null when no column names a side */
export function alignValue(aligns: readonly string[]): string | null {
	if (aligns.every((align) => align === UNSAID)) return null;
	return aligns.every((align) => align === aligns[0]) ? aligns[0] : `(${aligns.join(', ')})`;
}

/** the columns with one set to `side`, its vertical part kept */
export function withColumnSide(aligns: readonly string[], column: number, side: ColumnSide): string[] {
	return aligns.map((align, i) => (i === column ? withHorizontal(align === UNSAID ? '' : align, side) : align));
}
