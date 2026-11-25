import { describe, expect, it } from 'vitest';
import type { BlockLayout } from '$lib/editor/canvas';
import { changedBands, INK_OVERFLOW, type BlockPaint, type TileContent } from '$lib/editor/canvas/frame/tiles/tileContent';
import { testSchema } from '../../testing/testCanvasView';

const ROW = { x: -48, y: 0, width: 700, height: 512 };

function block(text: string, top: number, height = 60, marks: BlockPaint['marks'] = []): BlockPaint {
	return { node: testSchema.node('paragraph', null, [testSchema.text(text)]), layout: { height } as BlockLayout, top, marks };
}

function content(blocks: BlockPaint[], scene = 'light'): TileContent {
	return { scene, blocks };
}

describe('a row of tiles', () => {
	const first = block('one', 0);
	const second = block('two', 60);
	const third = block('three', 120);
	const row = content([first, second, third]);

	it('repaints nothing when its blocks, tints and selection are the ones it drew', () => {
		expect(changedBands(row, content([first, second, third]), ROW)).toEqual([]);
	});

	it('repaints the band of the one block a key changed', () => {
		const typed = { ...block('twoo', 60), layout: { height: 60 } as BlockLayout };
		expect(changedBands(row, content([first, typed, third]), ROW)).toEqual([{ from: 60 - INK_OVERFLOW, to: 120 + INK_OVERFLOW }]);
	});

	it('repaints a block whose selection shade moved, and everything below a block that grew', () => {
		const shaded = { ...second, marks: [{ from: 0, to: 3, look: 'selection' }] };
		expect(changedBands(row, content([first, shaded, third]), ROW)).toEqual([{ from: 60 - INK_OVERFLOW, to: 120 + INK_OVERFLOW }]);
		const grown = block('two and more', 60, 84);
		const moved = { ...third, top: 144 };
		expect(changedBands(row, content([first, grown, moved]), ROW)).toEqual([{ from: 60 - INK_OVERFLOW, to: 204 + INK_OVERFLOW }]);
	});

	it('repaints only the lines the painter says changed, when tints kept their places beside the typed text', () => {
		const tinted = block('two words', 60, 60, [{ from: 5, to: 10, look: 'spell' }]);
		const typed = block('two wordss', 60, 60, [{ from: 5, to: 10, look: 'spell' }]);
		const before = content([first, tinted, third]);
		const ink = () => [{ from: 24, to: 40 }];
		expect(changedBands(before, content([first, typed, third]), ROW, ink)).toEqual([{ from: 84, to: 100 }]);
		const moved = block('two wordss', 60, 60, [{ from: 6, to: 12, look: 'spell' }]);
		expect(changedBands(before, content([first, moved, third]), ROW, ink)).toEqual([{ from: 60 - INK_OVERFLOW, to: 120 + INK_OVERFLOW }]);
	});

	it('repaints all of it for a new scene or a row never drawn', () => {
		expect(changedBands(row, content([first, second, third], 'dark'), ROW)).toBe('all');
		expect(changedBands(null, row, ROW)).toBe('all');
	});
});
