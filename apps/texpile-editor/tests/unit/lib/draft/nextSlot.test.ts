import { describe, expect, it } from 'vitest';
import { nextSlot } from '$lib/draft/heuristics/nextSlot';

// The decisions under test: the next column comes from the page's own column boxes, an
// empty one included, and the displacement a moved row carries is measured between real
// column origins rather than reconstructed from a padded window.
type Rec = Record<string, unknown>;

const W = 229.5;
const COL2 = 239.5; // \columnwidth 229.5 + \columnsep 10
const col = (x: number): Rec => ({ t: 'col', i: 1, x, y: 603, w: W, h: 550, d: 0 });
const line = (x: number, y: number): Rec => ({ t: 'pl', x, y, w: W, h: 8, d: 3 });
const glyph = (x: number, y: number): Rec => ({ t: 'g', x, y });

// column 2's window: the pad narrows to 5 so it cannot overlap column 1's
const inCol2 = { pageNo: 1, colL: COL2 - 5, colR: COL2 + W + 8, W, medGap: 12 };

function ctxOf(pages: Record<number, Rec[]>) {
	return {
		pageRecords: (n: number) => pages[n] ?? [],
		contentFloor: () => 600,
		pageCount: () => Object.keys(pages).length,
		colSep: 10
	};
}

describe('nextSlot', () => {
	it('moves a row between real column origins, not between padded window edges', () => {
		const ctx = ctxOf({
			1: [col(0), col(COL2), line(COL2, 100), glyph(COL2, 100)],
			2: [col(0), col(COL2), line(0, 80), glyph(0, 80)]
		});
		const slot = nextSlot(ctx, inCol2, 60)!;
		// column 2 is the page's last, so the spill leaves the page
		expect(slot.samePage).toBe(false);
		expect(slot.spillPage).toBe(2);
		expect(slot.colTx).toBe(0);
		// the true displacement is one column origin to the other. Reconstructing this
		// column's text left as colL + gutter put it at 242.5 and drifted the rows by 3pt.
		expect(slot.movedDx).toBe(-COL2);
	});

	it('finds the next column on the same page from the column boxes', () => {
		const ctx = ctxOf({
			1: [col(0), col(COL2), line(0, 100), glyph(0, 100)],
			2: [col(0)]
		});
		const slot = nextSlot(ctx, { pageNo: 1, colL: -8, colR: W + 5, W, medGap: 12 }, 60)!;
		expect(slot.samePage).toBe(true);
		expect(slot.colTx).toBe(COL2);
		expect(slot.movedDx).toBe(COL2);
	});

	it('a recorded second column counts even when no glyph reaches it', () => {
		// the arithmetic path proved a next column by finding a glyph past its origin, so a
		// column holding only a float routed the spill to the next page instead
		const ctx = ctxOf({
			1: [col(0), col(COL2), line(0, 100), glyph(0, 100)],
			2: [col(0)]
		});
		expect(nextSlot(ctx, { pageNo: 1, colL: -8, colR: W + 5, W, medGap: 12 }, 60)!.samePage).toBe(true);
		// without the column records the same page has to fall back, and does route onward
		const noCols = ctxOf({ 1: [line(0, 100), glyph(0, 100)], 2: [line(0, 80), glyph(0, 80)] });
		expect(nextSlot(noCols, { pageNo: 1, colL: -8, colR: W + 8, W, medGap: 12 }, 60)!.samePage).toBe(false);
	});
});
