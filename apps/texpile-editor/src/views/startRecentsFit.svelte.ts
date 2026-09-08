// how many recent folders the start screen can list before it would have to scroll: the rows are
// the one part of the card that gives way, everything else is measured as fixed height
export class RecentsFit {
	count = $state(0);
	private rowPitch = 0;
	/** the heading and the show-all line: what the block costs beyond its rows, kept from when it was up */
	private blockChrome = 0;

	constructor(private readonly cap: number) {
		this.count = cap;
	}

	/** action for the card; measures it against its scroll parent and the padding around it */
	attach = (card: HTMLElement) => {
		const frame = scrollParent(card);
		const measure = () => {
			const rows = card.querySelectorAll<HTMLElement>('[data-recent-row]');
			if (rows.length) {
				const first = rows[0].getBoundingClientRect();
				const last = rows[rows.length - 1].getBoundingClientRect();
				this.rowPitch = (last.bottom - first.top) / rows.length;
			}
			if (!frame || !this.rowPitch) return;
			const block = card.querySelector<HTMLElement>('[data-recent-block]');
			if (block) this.blockChrome = block.getBoundingClientRect().height - rows.length * this.rowPitch;
			const around = getComputedStyle(card.parentElement ?? card);
			// rects, not offsetHeight/clientHeight: at most zoom levels the card and the frame are not whole
			// pixels, and the rounded values let a fit land a fraction over the frame, which is a scrollbar
			const available = frame.getBoundingClientRect().height - parseFloat(around.paddingTop) - parseFloat(around.paddingBottom);
			// a hidden block is costed as if it were up, or hiding it would free the room that brings it back
			const fixed = card.getBoundingClientRect().height - rows.length * this.rowPitch + (block ? 0 : this.blockChrome);
			// one pixel in hand for layout snapping once the rows are actually laid out
			const fit = Math.floor((available - fixed - 1) / this.rowPitch);
			const next = Math.max(0, Math.min(this.cap, fit));
			if (next !== this.count) this.count = next;
		};
		const ro = new ResizeObserver(measure);
		ro.observe(frame ?? card);
		ro.observe(card);
		measure();
		return { destroy: () => ro.disconnect() };
	};
}

function scrollParent(el: HTMLElement): HTMLElement | null {
	for (let cur = el.parentElement; cur; cur = cur.parentElement) {
		const oy = getComputedStyle(cur).overflowY;
		if (oy === 'auto' || oy === 'scroll') return cur;
	}
	return null;
}
