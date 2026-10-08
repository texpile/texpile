// A tab or files dragged to a slot's edge: the layout grows that way and they open in the new slot, as in VS Code
import { cellOf, type EditorLayout } from './layouts';

export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

/** the layout one track bigger along an axis, if there is one */
const GROWN: Record<EditorLayout, { across: EditorLayout | null; down: EditorLayout | null }> = {
	one: { across: 'columns', down: 'rows' },
	columns: { across: null, down: 'grid' },
	rows: { across: 'grid', down: null },
	grid: { across: null, down: null }
};

/** the slot's outer quarter on each side is its edge */
const EDGE = 0.25;

export function zoneAt(box: { left: number; top: number; width: number; height: number }, x: number, y: number): DropZone {
	const near: [DropZone, number][] = [
		['left', (x - box.left) / box.width],
		['right', (box.left + box.width - x) / box.width],
		['top', (y - box.top) / box.height],
		['bottom', (box.top + box.height - y) / box.height]
	];
	const [zone, distance] = near.reduce((a, b) => (b[1] < a[1] ? b : a));
	return distance < EDGE ? zone : 'center';
}

function placeIn(layout: EditorLayout, row: number, column: number): number {
	return [0, 1, 2, 3].findIndex((i) => cellOf(layout, i).row === row && cellOf(layout, i).column === column);
}

export type SplitTarget = {
	layout: EditorLayout;
	/** where the dropped slot ends up, in the new layout's order */
	place: number;
	/** a drop on the left or top: the slot dropped on moves over, so these two places trade */
	trade: [number, number] | null;
};

/** what a drop on `zone` of the slot at `index` grows into; null where the layout cannot grow that way */
export function splitTarget(layout: EditorLayout, index: number, zone: DropZone): SplitTarget | null {
	if (zone === 'center') return null;
	const across = zone === 'left' || zone === 'right';
	const next = across ? GROWN[layout].across : GROWN[layout].down;
	if (!next) return null;
	const { row, column } = cellOf(layout, index);
	const added = across ? placeIn(next, row, column + 1) : placeIn(next, row + 1, column);
	const own = placeIn(next, row, column);
	const before = zone === 'left' || zone === 'top';
	return { layout: next, place: before ? own : added, trade: before ? [own, added] : null };
}
