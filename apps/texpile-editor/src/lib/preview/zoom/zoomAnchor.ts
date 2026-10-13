// keeps the spot under the pointer in place while a preview's pages change size

type HeldSpot = { page: HTMLElement; fx: number; fy: number; x: number; y: number; at: number };

/** one pinch is dozens of events: the spot is taken at its start, or each rounded scroll would move it a little */
const held = new WeakMap<HTMLElement, HeldSpot>();

/** the page under `y`, or the nearest one when the pointer is in a gap */
function pageAt(pages: readonly HTMLElement[], y: number): HTMLElement | null {
	let best: HTMLElement | null = null;
	let bestGap = Infinity;
	for (const page of pages) {
		const r = page.getBoundingClientRect();
		const gap = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
		if (gap < bestGap) {
			best = page;
			bestGap = gap;
		}
		if (gap === 0) break;
	}
	return best;
}

function spotAt(pages: readonly HTMLElement[], x: number, y: number): HeldSpot | null {
	const page = pageAt(pages, y);
	const r = page?.getBoundingClientRect();
	if (!page || !r?.width || !r.height) return null;
	return { page, fx: (x - r.left) / r.width, fy: (y - r.top) / r.height, x, y, at: 0 };
}

/** `resize` changes the page sizes synchronously; the scroller then moves so the point at `x`, `y` stays put */
export function keepPointUnder(scroller: HTMLElement, pages: readonly HTMLElement[], x: number, y: number, resize: () => void): void {
	const last = held.get(scroller);
	const same =
		last && performance.now() - last.at < 300 && Math.abs(last.x - x) < 3 && Math.abs(last.y - y) < 3 && pages.includes(last.page);
	const spot = same ? last : spotAt(pages, x, y);
	resize();
	if (!spot) return;
	spot.at = performance.now();
	held.set(scroller, spot);
	const after = spot.page.getBoundingClientRect();
	scroller.scrollBy(after.left + spot.fx * after.width - x, after.top + spot.fy * after.height - y);
}
