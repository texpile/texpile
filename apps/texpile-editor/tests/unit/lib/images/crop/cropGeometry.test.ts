import { describe, expect, it } from 'vitest';
import { dragCrop, turnCrop, flipCrop, type Crop } from '$lib/images/crop/cropGeometry';

const MIN = { x: 0.05, y: 0.05 };

function expectCrop(actual: Crop, expected: Crop): void {
	for (const side of ['l', 't', 'r', 'b'] as const) expect(actual[side]).toBeCloseTo(expected[side]);
}

describe('the crop box', () => {
	it('moves inside the image and stops at its edges', () => {
		expectCrop(dragCrop({ l: 0.1, t: 0.1, r: 0.2, b: 0.2 }, 'move', 0.5, -0.5, MIN), { l: 0.3, t: 0, r: 0, b: 0.3 });
	});

	it('keeps a smallest box when a corner is dragged past the opposite one', () => {
		expectCrop(dragCrop({ l: 0, t: 0, r: 0, b: 0 }, 'nw', 2, 2, MIN), { l: 0.95, t: 0.95, r: 0, b: 0 });
	});

	it('follows the image through a turn and back, and a flip', () => {
		const c = { l: 0.1, t: 0.2, r: 0.3, b: 0.4 };
		expect(turnCrop(c, 'right')).toEqual({ l: 0.4, t: 0.1, r: 0.2, b: 0.3 });
		expect(turnCrop(turnCrop(c, 'right'), 'left')).toEqual(c);
		expect(flipCrop(c, 'x')).toEqual({ l: 0.3, t: 0.2, r: 0.1, b: 0.4 });
	});
});
