import { describe, expect, it } from 'vitest';
import { handleTop, pointerStaysWithBlock } from '$lib/editor/visual/extensions/blockHandle/handleReach';

const text = { left: 100, right: 500 };

describe('the pointer and the block its handle stands on', () => {
	it('stays with a tall block anywhere beside it in a gutter, and leaves once past it', () => {
		const table = { top: 200, bottom: 430 };
		expect(pointerStaysWithBlock({ x: 520, y: 320 }, text, table, { top: 200, bottom: 246 })).toBe(true);
		expect(pointerStaysWithBlock({ x: 80, y: 205 }, text, table, { top: 200, bottom: 246 })).toBe(true);
		expect(pointerStaysWithBlock({ x: 520, y: 460 }, text, table, { top: 200, bottom: 246 })).toBe(false);
	});

	it('stays with a one-line block down to its lowest button, over the text of the next block too', () => {
		const line = { top: 200, bottom: 228 };
		expect(pointerStaysWithBlock({ x: 480, y: 240 }, text, line, { top: 200, bottom: 246 })).toBe(true);
		expect(pointerStaysWithBlock({ x: 520, y: 244 }, text, line, { top: 200, bottom: 246 })).toBe(true);
		expect(pointerStaysWithBlock({ x: 480, y: 260 }, text, line, { top: 200, bottom: 246 })).toBe(false);
	});

	it('stands on the first line, and centers a column taller than its block on it', () => {
		const paragraph = { top: 200, bottom: 284 };
		expect(handleTop(214, paragraph, 22, 22)).toBe(203);
		expect(handleTop(214, paragraph, 70, 22)).toBe(203);
		const equation = { top: 200, bottom: 240 };
		const top = handleTop(220, equation, 94, 22);
		expect(top).toBe(173);
		const buttons = { top, bottom: top + 94 };
		expect(pointerStaysWithBlock({ x: 80, y: 176 }, text, equation, buttons)).toBe(true);
		expect(pointerStaysWithBlock({ x: 120, y: 185 }, text, equation, buttons)).toBe(true);
		expect(pointerStaysWithBlock({ x: 120, y: 160 }, text, equation, buttons)).toBe(false);
	});

	it('leaves the choice of block to the text inside a block, where a list item may hold another', () => {
		expect(pointerStaysWithBlock({ x: 300, y: 300 }, text, { top: 200, bottom: 430 }, { top: 200, bottom: 222 })).toBe(false);
	});
});
