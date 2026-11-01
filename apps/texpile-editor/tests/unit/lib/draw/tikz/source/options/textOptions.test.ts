import { describe, expect, it } from 'vitest';
import { readTextColor, readTextSize, withTextColor, withTextSize } from '$lib/draw/tikz/source/options/textOptions';

describe('node text', () => {
	it('swaps the size in font= and keeps the rest of it', () => {
		const items = ['draw', 'font=\\bfseries\\small'];
		expect(readTextSize(items)).toBe('small');
		expect(withTextSize(items, 'Large')).toEqual(['draw', 'font=\\Large \\bfseries']);
		expect(withTextSize(['font=\\small'], 'normalsize')).toEqual([]);
		expect(readTextSize(['font=\\Huge'])).toBe('custom');
	});

	it('reads the text color from text=, color= or a bare color, and writes text=', () => {
		expect(readTextColor(['draw', 'red'])).toBe('red');
		expect(readTextColor(['color=blue', 'text=green!50'])).toBe('green!50');
		expect(withTextColor(['text=red', 'draw'], 'blue')).toEqual(['draw', 'text=blue']);
		expect(withTextColor(['text=red'], 'black')).toEqual([]);
	});
});
