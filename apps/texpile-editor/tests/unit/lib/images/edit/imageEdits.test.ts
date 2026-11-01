import { describe, expect, it } from 'vitest';
import { NO_EDITS, editedSize, flipped, isUnedited, turned } from '$lib/images/edit/imageEdits';

describe('an image edit', () => {
	it('is back to none after four quarter turns, or a flip twice', () => {
		const four = [1, 2, 3, 4].reduce((e) => turned(e, 'right'), NO_EDITS);
		expect(isUnedited(four)).toBe(true);
		expect(isUnedited(flipped(flipped(NO_EDITS, 'x'), 'x'))).toBe(true);
	});

	it('sizes a turned, cropped and shrunk image', () => {
		const edits = { ...turned(NO_EDITS, 'right'), crop: { l: 0.5, t: 0, r: 0, b: 0 }, width: 300 };
		// 2000 x 1000 turned is 1000 x 2000, half its width kept is 500 x 2000, shrunk to 300 wide
		expect(editedSize(edits, 2000, 1000)).toEqual({ w: 300, h: 1200 });
	});
});
