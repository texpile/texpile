// track sizing: lengths, fr, minmax, content sizes, repeat and the auto placement of items
import { describe, expect, it } from 'vitest';
import { parseTrackList, sizeGridTracks } from '$lib/editor/canvas/layout/formatting/gridTracks';
import { placeGridItems } from '$lib/editor/canvas/layout/formatting/gridPlacement';

const context = (available: number | null, gap = 0) => ({ available, fontPx: 16, gap });
const sized = (
	template: string,
	available: number | null,
	items: { start: number; span?: number; min: number; max: number }[] = [],
	gap = 0
) =>
	sizeGridTracks(
		parseTrackList(template, context(available, gap)),
		available,
		gap,
		items.map((item) => ({ span: 1, ...item }))
	);

describe('track sizes', () => {
	it('gives fr tracks the room the lengths leave, by weight', () => {
		expect(sized('100px 1fr 2fr', 400)).toEqual([100, 100, 200]);
		expect(sized('1fr 1fr', 410, [], 10)).toEqual([200, 200]);
	});

	it('sizes the definitions grid: two content columns and a minmax(0, 1fr) rest', () => {
		const items = [
			{ start: 0, min: 40, max: 40 },
			{ start: 1, min: 10, max: 90 },
			{ start: 2, min: 30, max: 500 }
		];
		expect(sized('max-content max-content minmax(0px, 1fr)', 300, items)).toEqual([40, 90, 170]);
	});

	it('lets an fr track grow past its share to hold its content', () => {
		expect(sized('1fr 1fr', 200, [{ start: 0, min: 150, max: 150 }])).toEqual([150, 50]);
	});

	it('stretches auto tracks equally, to the room when no track is flexible', () => {
		const items = [
			{ start: 0, min: 20, max: 60 },
			{ start: 1, min: 20, max: 20 }
		];
		expect(sized('repeat(2, auto)', 200, items)).toEqual([120, 80]);
	});

	it('shares a spanning item over the tracks it covers', () => {
		expect(sized('auto auto', null, [{ start: 0, span: 2, min: 100, max: 100 }])).toEqual([50, 50]);
	});

	it('repeats as many auto-fill tracks as fit', () => {
		expect(parseTrackList('repeat(auto-fill, minmax(68px, 1fr))', context(300, 4))).toHaveLength(4);
	});
});

describe('placement', () => {
	const line = (start: string, end = 'auto') => ({ start, end });
	const auto = { column: line('auto'), row: line('auto') };

	it('fills rows left to right, then wraps', () => {
		const cells = placeGridItems({ items: [auto, auto, auto], explicitColumns: 2, explicitRows: 0, byColumn: false });
		expect(cells.map((cell) => [cell.row, cell.column])).toEqual([
			[0, 0],
			[0, 1],
			[1, 0]
		]);
	});

	it('honours lines and spans, and routes the others around them', () => {
		const spanning = { column: line('1', 'span 2'), row: line('auto') };
		const cells = placeGridItems({ items: [spanning, auto, auto], explicitColumns: 3, explicitRows: 0, byColumn: false });
		expect(cells[0]).toMatchObject({ row: 0, column: 0, columnSpan: 2 });
		expect(cells.slice(1).map((cell) => [cell.row, cell.column])).toEqual([
			[0, 2],
			[1, 0]
		]);
	});

	it('takes the Typst table cell form: row and column lines with spans', () => {
		const cell = { column: line('2', 'span 2'), row: line('1', 'span 1') };
		expect(placeGridItems({ items: [cell], explicitColumns: 3, explicitRows: 0, byColumn: false })[0]).toMatchObject({
			row: 0,
			column: 1,
			columnSpan: 2
		});
	});
});
