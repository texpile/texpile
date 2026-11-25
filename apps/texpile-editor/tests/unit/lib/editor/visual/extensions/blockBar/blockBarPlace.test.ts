import { expect, it } from 'vitest';
import { blockBarPlace } from '$lib/editor/visual/extensions/blockBar/blockBarPlace';

const pane = { top: 100, bottom: 700, left: 0, right: 800 };
const bar = { width: 200, height: 36 };

it('stands above the block, centered on it', () => {
	expect(blockBarPlace({ top: 300, bottom: 500, left: 100, right: 700 }, pane, bar)).toEqual({ left: 300, top: 256 });
});

// a picture at the top of the pane had its bar under the toolbar, and a tall one scrolled past its top had none on screen
it('goes below a block at the pane top, and stays at the pane top over a tall block scrolled past it', () => {
	expect(blockBarPlace({ top: 110, bottom: 300, left: 100, right: 700 }, pane, bar)?.top).toBe(308);
	expect(blockBarPlace({ top: -400, bottom: 650, left: 100, right: 700 }, pane, bar)?.top).toBe(104);
	expect(blockBarPlace({ top: -400, bottom: 90, left: 100, right: 700 }, pane, bar)).toBeNull();
});
