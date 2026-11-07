import { describe, expect, it } from 'vitest';
import { jumpScrollShift } from '$lib/editor/jumpPlacement';

const viewport = { top: 100, bottom: 500 };

describe('jumpScrollShift', () => {
	it('does not scroll to a target that is fully visible', () => {
		expect(jumpScrollShift({ top: 100, bottom: 120 }, viewport)).toBeNull();
		expect(jumpScrollShift({ top: 480, bottom: 500 }, viewport)).toBeNull();
	});

	it('centers a target below, above or half outside the viewport', () => {
		expect(jumpScrollShift({ top: 900, bottom: 920 }, viewport)).toBe(610);
		expect(jumpScrollShift({ top: -300, bottom: -280 }, viewport)).toBe(-590);
		expect(jumpScrollShift({ top: 490, bottom: 510 }, viewport)).toBe(200);
	});
});
