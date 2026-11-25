// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CanvasTiles, deviceSnapOf, TILE_DEVICE_PX } from '$lib/editor/canvas/frame/tiles/canvasTiles';

/** where Chromium composites a layer: its paint offset rounded, its translate added as it is */
function compositedX(paintOffset: number, el: HTMLElement, dpr: number): number {
	const translate = /translate\(([-\d.e]+)px/.exec(el.style.transform);
	return Math.round(paintOffset) + (translate ? parseFloat(translate[1]) * dpr : 0);
}

describe('the content rows', () => {
	it('sit on whole device pixels where view.dom does not, and say which doc pixels they hold', () => {
		const dpr = 1.2;
		// the pane at 120 %: view.dom's client x 225.578125 is device x 270.69375
		const viewLeft = 225.578125;
		const snap = deviceSnapOf(viewLeft, 101.3, dpr);
		expect(snap).toEqual(deviceSnapOf(viewLeft + 1e-9, 101.3 - 1e-9, dpr));
		const tiles = new CanvasTiles(document);
		tiles.setGrid({ left: -120.4, width: 800, dpr, snap });
		const host = parseFloat(tiles.host.style.left) * dpr;
		const view = viewLeft * dpr;
		for (const row of [0, 3]) {
			const { canvas } = tiles.tile(row);
			const x = compositedX(view + host, canvas, dpr);
			expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-6);
			expect(Math.abs(x - (view + tiles.rowBox(row).x * dpr))).toBeLessThan(1 / 64);
			expect(canvas.width / dpr).toBeCloseTo(tiles.rowBox(row).width, 9);
			expect(view + tiles.rowBox(row).x * dpr).toBeLessThanOrEqual(view - 120.4 * dpr);
		}
		const rowEnd = (TILE_DEVICE_PX + snap.y) / dpr;
		expect(tiles.rowsOver(0, rowEnd - 0.01)).toEqual({ first: 0, last: 0 });
		expect(tiles.rowsOver(rowEnd + 0.01, rowEnd + 1)).toEqual({ first: 1, last: 1 });
	});
});
