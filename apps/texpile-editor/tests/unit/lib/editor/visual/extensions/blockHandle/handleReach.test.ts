import { describe, expect, it } from 'vitest';
import { pointerStaysWithBlock } from '$lib/editor/visual/extensions/blockHandle/handleReach';

const text = { left: 100, right: 500 };

describe('the pointer and the block its handle stands on', () => {
	it('stays with a tall block anywhere beside it in a gutter, and leaves once past it', () => {
		const table = { top: 200, bottom: 430 };
		expect(pointerStaysWithBlock({ x: 520, y: 320 }, text, table, 246)).toBe(true);
		expect(pointerStaysWithBlock({ x: 80, y: 205 }, text, table, 246)).toBe(true);
		expect(pointerStaysWithBlock({ x: 520, y: 460 }, text, table, 246)).toBe(false);
	});

	it('stays with a one-line block down to its lowest button, over the text of the next block too', () => {
		const line = { top: 200, bottom: 228 };
		expect(pointerStaysWithBlock({ x: 480, y: 240 }, text, line, 246)).toBe(true);
		expect(pointerStaysWithBlock({ x: 520, y: 244 }, text, line, 246)).toBe(true);
		expect(pointerStaysWithBlock({ x: 480, y: 260 }, text, line, 246)).toBe(false);
	});

	it('leaves the choice of block to the text inside a block, where a list item may hold another', () => {
		expect(pointerStaysWithBlock({ x: 300, y: 300 }, text, { top: 200, bottom: 430 }, 222)).toBe(false);
	});
});
