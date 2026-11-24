import { describe, expect, it } from 'vitest';
import { expandShorthand } from '$lib/editor/canvas/style/resolve/shorthands';

describe('the font shorthand', () => {
	it('takes a numeric weight and an oblique angle before the size', () => {
		const font = new Map(expandShorthand('font', 'oblique 10deg 600 14px/1.5 Inter, sans-serif'));
		expect([font.get('fontStyle'), font.get('fontWeight'), font.get('fontSize'), font.get('lineHeight'), font.get('fontFamily')]).toEqual([
			'oblique 10deg',
			'600',
			'14px',
			'1.5',
			'Inter, sans-serif'
		]);
	});
});
