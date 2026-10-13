import { it, expect } from 'vitest';
import { keepPointUnder } from '../../../../../src/lib/preview/zoom/zoomAnchor';

// a scroller at the window's top left, with pages stacked 20px apart and 10px in from its left edge
function preview(zoom: { value: number }, round = (v: number) => v) {
	const scroller = {
		scrollLeft: 0,
		scrollTop: 0,
		scrollBy(x: number, y: number) {
			this.scrollLeft = round(this.scrollLeft + x);
			this.scrollTop = round(this.scrollTop + y);
		}
	} as HTMLElement;
	const pages = [0, 1].map(
		(i) =>
			({
				getBoundingClientRect: () => {
					const w = 600 * zoom.value;
					const h = 800 * zoom.value;
					const top = 20 + i * (h + 20) - scroller.scrollTop;
					const left = 10 - scroller.scrollLeft;
					return { left, top, width: w, height: h, right: left + w, bottom: top + h } as DOMRect;
				}
			}) as HTMLElement
	);
	return { scroller, pages };
}

it('keeps the spot under the pointer in place on the second page', () => {
	const zoom = { value: 1 };
	const { scroller, pages } = preview(zoom);
	scroller.scrollTop = 700;
	const x = 310;
	const y = 400;
	const r = pages[1].getBoundingClientRect();
	const at = { fx: (x - r.left) / r.width, fy: (y - r.top) / r.height };
	keepPointUnder(scroller, pages, x, y, () => (zoom.value = 1.5));
	const n = pages[1].getBoundingClientRect();
	expect(n.left + at.fx * n.width).toBeCloseTo(x);
	expect(n.top + at.fy * n.height).toBeCloseTo(y);
});

it('does not drift over the many small steps of one pinch, though the scroller rounds', () => {
	const zoom = { value: 1 };
	const { scroller, pages } = preview(zoom, Math.round);
	const x = 333;
	const y = 457;
	const r = pages[0].getBoundingClientRect();
	const at = { fx: (x - r.left) / r.width, fy: (y - r.top) / r.height };
	for (let i = 0; i < 60; i++) keepPointUnder(scroller, pages, x, y, () => (zoom.value *= 1.008));
	const n = pages[0].getBoundingClientRect();
	expect(Math.abs(n.left + at.fx * n.width - x)).toBeLessThan(1);
	expect(Math.abs(n.top + at.fy * n.height - y)).toBeLessThan(1);
});
