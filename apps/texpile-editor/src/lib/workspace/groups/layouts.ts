// The editor layouts on offer, and where each slot sits in them. A slot keeps its place when the layout
// changes and the new one has it; the slots of a smaller layout's missing places go
export type EditorLayout = 'one' | 'columns' | 'rows' | 'grid';

export const LAYOUTS: EditorLayout[] = ['one', 'columns', 'rows', 'grid'];

/** row and column of each slot, in reading order */
const CELLS: Record<EditorLayout, [number, number][]> = {
	one: [[0, 0]],
	columns: [
		[0, 0],
		[0, 1]
	],
	rows: [
		[0, 0],
		[1, 0]
	],
	grid: [
		[0, 0],
		[0, 1],
		[1, 0],
		[1, 1]
	]
};

export function slotCount(layout: EditorLayout): number {
	return CELLS[layout].length;
}

export function cellOf(layout: EditorLayout, index: number): { row: number; column: number } {
	const [row, column] = CELLS[layout][index] ?? [0, 0];
	return { row, column };
}

export function tracksOf(layout: EditorLayout): { rows: number; columns: number } {
	const cells = CELLS[layout];
	return { rows: Math.max(...cells.map(([r]) => r)) + 1, columns: Math.max(...cells.map(([, c]) => c)) + 1 };
}

/** the view of a split preview a slot's sync goes to: level with its row, or its column for two side by side */
export function previewViewOf(layout: EditorLayout, index: number): number | undefined {
	if (layout === 'one' || index < 0) return undefined;
	const { row, column } = cellOf(layout, index);
	return layout === 'columns' ? column : row;
}

function placeKey([row, column]: [number, number]): string {
	return `${row},${column}`;
}

/**
 * The slots of `from` placed in `to`: each where the same place is, null for a place that needs a new slot,
 * and the slots with no place left. Two side by side and two stacked trade places in order
 */
export function relayout<T>(slots: T[], from: EditorLayout, to: EditorLayout): { kept: (T | null)[]; gone: T[] } {
	if (slotCount(from) === slotCount(to)) return { kept: CELLS[to].map((_, i) => slots[i] ?? null), gone: [] };
	const at = new Map(CELLS[from].map((cell, i) => [placeKey(cell), slots[i]]));
	const kept = CELLS[to].map((cell) => at.get(placeKey(cell)) ?? null);
	return { kept, gone: slots.filter((s) => !kept.some((k) => k === s)) };
}

/**
 * A slot left with no tabs closes, as in VS Code: the smaller layout the slots that still have tabs fit, and
 * which slots it keeps, in its order. Null when they still need the layout there is
 */
export function shrunkLayout(layout: EditorLayout, filled: boolean[]): { layout: EditorLayout; keep: number[] } | null {
	const full = filled.flatMap((f, i) => (f ? [i] : []));
	if (layout === 'one' || full.length > 2 || (full.length === 2 && layout !== 'grid')) return null;
	if (full.length < 2) return { layout: 'one', keep: [full[0] ?? 0] };
	const [a, b] = full.map((i) => cellOf('grid', i));
	return { layout: a.column === b.column ? 'rows' : 'columns', keep: full };
}
