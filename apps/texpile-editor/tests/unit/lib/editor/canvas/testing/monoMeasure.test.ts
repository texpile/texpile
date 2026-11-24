import { describe, expect, it } from 'vitest';
import { monoMeasure } from './monoMeasure';

describe('monoMeasure', () => {
	it('gives 0.6 em per character and 1 em per CJK character at the font size', () => {
		expect(monoMeasure('italic 700 20px serif', 'abc')).toBeCloseTo(36);
		expect(monoMeasure('16px serif', '漢字a')).toBeCloseTo(41.6);
	});
});
