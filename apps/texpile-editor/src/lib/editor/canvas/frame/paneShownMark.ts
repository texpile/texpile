// data-canvas-shown on the pane's scroll box while the view shows its paper, so DOM drawn with the paper (the title fields,
// the comment cards) shows in the same frame as the rows
const SHOWN = 'data-canvas-shown';

export class PaneShownMark {
	private box: HTMLElement | null = null;
	private shown = false;
	private queued = false;

	/** the scroll box the frame found the view in */
	attach(box: HTMLElement): void {
		if (box === this.box) return;
		this.box?.removeAttribute(SHOWN);
		this.box = box;
		box.toggleAttribute(SHOWN, this.shown);
	}

	hide(): void {
		this.shown = false;
		this.box?.removeAttribute(SHOWN);
	}

	/** after the frame's listeners: the DOM they move (a comment card's place) lands first, under its held style */
	show(): void {
		this.shown = true;
		if (this.queued) return;
		this.queued = true;
		queueMicrotask(() => {
			this.queued = false;
			const box = this.box;
			if (!box || !this.shown) return;
			// a style change that also turned the cards' transitions back on would glide them from their held places
			void box.offsetHeight;
			box.setAttribute(SHOWN, '');
		});
	}

	destroy(): void {
		this.hide();
		this.box = null;
	}
}
