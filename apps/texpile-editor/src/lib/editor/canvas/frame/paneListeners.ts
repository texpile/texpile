// what asks for frames beside the view's own changes: the pane's scrolls and resizes; the scrollbar under the pointer
// and an app's smooth scroll pause the reading place
export type PaneEvents = {
	frame(): void;
	dragging(on: boolean): void;
	smoothScrollEnded(): void;
};

/** returns the way to stop listening */
export function listenToPane(win: Window, scroller: HTMLElement, sized: Element, events: PaneEvents): () => void {
	const doc = scroller.ownerDocument;
	const scrolling: EventTarget = scroller === doc.scrollingElement ? win : scroller;
	function onScroll(): void {
		events.frame();
	}
	function onPress(event: Event): void {
		if (event.target === scroller) events.dragging(true);
	}
	function onRelease(): void {
		events.dragging(false);
	}
	function onScrollEnd(): void {
		events.smoothScrollEnded();
	}
	scrolling.addEventListener('scroll', onScroll, { passive: true });
	scrolling.addEventListener('scrollend', onScrollEnd);
	scroller.addEventListener('pointerdown', onPress);
	win.addEventListener('pointerup', onRelease);
	const { ResizeObserver } = win as Window & typeof globalThis;
	const resize = ResizeObserver ? new ResizeObserver(() => events.frame()) : null;
	resize?.observe(scroller);
	resize?.observe(sized);
	return () => {
		scrolling.removeEventListener('scroll', onScroll);
		scrolling.removeEventListener('scrollend', onScrollEnd);
		scroller.removeEventListener('pointerdown', onPress);
		win.removeEventListener('pointerup', onRelease);
		resize?.disconnect();
	};
}
