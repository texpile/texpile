import { describe, expect, it } from 'vitest';
import { alignValue, columnAligns, sideOfAlign, withColumnSide } from '$lib/editor/visual/extensions/table/columns/typstColumnAligns';

describe("a Typst table's align: by column", () => {
	it('reads one value, a list or nothing as a value per column, and leaves a function alone', () => {
		expect(columnAligns(null, 2)).toEqual(['auto', 'auto']);
		expect(columnAligns('center + horizon', 2)).toEqual(['center + horizon', 'center + horizon']);
		expect(columnAligns('(left, auto, right + bottom)', 3)).toEqual(['left', 'auto', 'right + bottom']);
		expect(columnAligns('(left, right)', 3)).toBeNull();
		expect(columnAligns('(x, y) => if y == 0 { center } else { left }', 2)).toBeNull();
		expect(sideOfAlign('horizon')).toBeNull();
		expect(sideOfAlign('end + top')).toBe('right');
	});

	it('sets one column, keeping its vertical part and what the other columns say', () => {
		expect(alignValue(withColumnSide(['auto', 'auto'], 1, 'right'))).toBe('(auto, right)');
		expect(alignValue(withColumnSide(['left + horizon', 'right'], 0, 'right'))).toBe('(right + horizon, right)');
		expect(alignValue(withColumnSide(['left', 'center'], 0, 'center'))).toBe('center');
		expect(alignValue(['auto', 'auto'])).toBeNull();
	});
});
