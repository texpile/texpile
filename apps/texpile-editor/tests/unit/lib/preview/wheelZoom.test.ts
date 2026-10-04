// A trackpad pinch is dozens of small wheel events: each used to count as a full 10% step, so a
// modest pinch on a Mac took the live view from 58% to the 500% cap.
import { it, expect } from 'vitest';
import { wheelZoomFactor } from '../../../../src/lib/preview/wheelZoom';

it('zooms a modest pinch by a modest amount', () => {
	let z = 1;
	for (let i = 0; i < 25; i++) z *= wheelZoomFactor({ deltaY: -2, deltaMode: 0 });
	expect(z).toBeGreaterThan(1.5);
	expect(z).toBeLessThan(1.8);
});

it('keeps one mouse wheel notch at a 10% step either way', () => {
	expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(1.1);
	expect(wheelZoomFactor({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(1 / 1.1);
});
