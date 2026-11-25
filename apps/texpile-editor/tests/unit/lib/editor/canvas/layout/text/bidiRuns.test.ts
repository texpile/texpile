import { describe, expect, it } from 'vitest';
import { bidiLevels, hasStrongRtl, levelRuns, visualOrder } from '$lib/editor/canvas/layout/text/bidiRuns';

describe('bidi runs', () => {
	it('leaves a Latin paragraph alone and reorders an Arabic word in an English line as one run', () => {
		expect(bidiLevels('plain text', 'ltr')).toBeNull();
		const text = 'the word مرحبا here';
		expect(hasStrongRtl(text)).toBe(true);
		const levels = bidiLevels(text, 'ltr')!;
		const runs = levelRuns(levels, 0, text.length);
		expect(runs.map((run) => text.slice(run.from, run.to))).toEqual(['the word ', 'مرحبا', ' here']);
		expect(runs.map((run) => run.level)).toEqual([0, 1, 0]);
	});

	it('reverses nested levels from the highest down (rule L2)', () => {
		const items = [
			{ id: 'a', level: 0 },
			{ id: 'b', level: 1 },
			{ id: 'c', level: 2 },
			{ id: 'd', level: 1 },
			{ id: 'e', level: 0 }
		];
		expect(visualOrder(items, (item) => item.level).map((item) => item.id)).toEqual(['a', 'd', 'c', 'b', 'e']);
	});
});
