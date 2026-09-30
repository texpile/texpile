// The picker's keyboard: the arrows walk a grid of tiles row by row, and the tabs in a ring.
import { describe, expect, it } from 'vitest';
import { BACK_TO_SEARCH, gridStep, tabStep } from '$lib/editor/symbols/symbolPickerKeys';

// 23 tiles, 10 wide: two full rows and a last row of three
const step = (key: string, index: number, jump = false) => gridStep(key, index, 23, 10, jump);

describe('gridStep', () => {
	it('moves one tile sideways and stops at the ends', () => {
		expect(step('ArrowRight', 4)).toBe(5);
		expect(step('ArrowLeft', 4)).toBe(3);
		expect(step('ArrowLeft', 0)).toBe(0);
		expect(step('ArrowRight', 22)).toBe(22);
	});

	it('moves a row down, onto the last tile where the short last row does not reach', () => {
		expect(step('ArrowDown', 4)).toBe(14);
		expect(step('ArrowDown', 12)).toBe(22);
		expect(step('ArrowDown', 18)).toBe(22);
		expect(step('ArrowDown', 21)).toBe(21);
	});

	it('moves a row up, and out to the search field from the top row', () => {
		expect(step('ArrowUp', 14)).toBe(4);
		expect(step('ArrowUp', 4)).toBe(BACK_TO_SEARCH);
	});

	it('goes to the ends of the row, or of the grid with Ctrl', () => {
		expect(step('Home', 14)).toBe(10);
		expect(step('End', 14)).toBe(19);
		expect(step('End', 21)).toBe(22);
		expect(step('Home', 14, true)).toBe(0);
		expect(step('End', 4, true)).toBe(22);
	});

	it('pages by four rows, clamped', () => {
		expect(gridStep('PageDown', 0, 100, 10, false)).toBe(40);
		expect(gridStep('PageUp', 45, 100, 10, false)).toBe(5);
		expect(gridStep('PageDown', 95, 100, 10, false)).toBe(99);
	});

	it('leaves other keys alone', () => {
		expect(step('a', 3)).toBeNull();
		expect(step('Enter', 3)).toBeNull();
	});
});

describe('tabStep', () => {
	it('wraps round the column with Up and Down and jumps with Home and End', () => {
		expect(tabStep('ArrowDown', 2, 5)).toBe(3);
		expect(tabStep('ArrowDown', 4, 5)).toBe(0);
		expect(tabStep('ArrowUp', 0, 5)).toBe(4);
		expect(tabStep('Home', 3, 5)).toBe(0);
		expect(tabStep('End', 1, 5)).toBe(4);
		expect(tabStep('ArrowRight', 1, 5)).toBeNull();
	});
});
