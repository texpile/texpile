import { describe, expect, it } from 'vitest';
import { typstTextStyle } from '$lib/languages/typst/visual/extensions/css/typstTextStyle';

describe('typstTextStyle', () => {
	it('reads a size and a color written without their names', () => {
		expect(typstTextStyle('red')).toBe('color: rgb(255, 65, 54)');
		expect(typstTextStyle('12pt, blue')).toBe('font-size: 12pt; color: rgb(0, 116, 217)');
		expect(typstTextStyle('fill: green, size: 9pt')).toBe('font-size: 9pt; color: rgb(46, 204, 64)');
	});
});
