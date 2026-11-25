// the page's scroller as the target of a drag past its top or bottom edge
import type { ScrollTarget } from './autoscroll';

export function pageScrollTarget(scroller: HTMLElement): ScrollTarget {
	return {
		axis: 'y',
		rect: () => {
			const box = scroller.getBoundingClientRect();
			return { start: box.top, end: box.bottom };
		},
		screen: () => scroller.clientHeight,
		scrollBy: (delta) => {
			const before = scroller.scrollTop;
			scroller.scrollBy({ top: delta, behavior: 'instant' });
			return scroller.scrollTop - before;
		}
	};
}
