// Page Up / Page Down move this many rows
const PAGE_ROWS = 4;

/** leave the grid for the search field above it */
export const BACK_TO_SEARCH = -1;

/**
 * Where a key moves the active tile of a grid `columns` wide holding `count` tiles: the index, the
 * same index when the key moves nowhere from there, BACK_TO_SEARCH for Up on the top row, or null
 * for a key the grid does not handle. Down from a row whose column the last row does not reach
 * lands on the last tile, so the bottom row is never skipped.
 */
export function gridStep(key: string, index: number, count: number, columns: number, jump: boolean): number | null {
	const last = count - 1;
	const rowStart = index - (index % columns);
	switch (key) {
		case 'ArrowRight':
			return Math.min(index + 1, last);
		case 'ArrowLeft':
			return Math.max(index - 1, 0);
		case 'ArrowDown':
			if (index + columns <= last) return index + columns;
			return rowStart + columns <= last ? last : index;
		case 'ArrowUp':
			return index - columns >= 0 ? index - columns : BACK_TO_SEARCH;
		case 'Home':
			return jump ? 0 : rowStart;
		case 'End':
			return jump ? last : Math.min(rowStart + columns - 1, last);
		case 'PageDown':
			return Math.min(index + columns * PAGE_ROWS, last);
		case 'PageUp':
			return Math.max(index - columns * PAGE_ROWS, 0);
		default:
			return null;
	}
}

/** where a key moves the selected tab of a column of `count`: Up and Down wrap round, Home and End go to the ends */
export function tabStep(key: string, index: number, count: number): number | null {
	switch (key) {
		case 'ArrowDown':
			return (index + 1) % count;
		case 'ArrowUp':
			return (index - 1 + count) % count;
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return null;
	}
}
