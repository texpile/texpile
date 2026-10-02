// where a narrow pane cuts the comment cards, and the color to fade them into there

/** a drawn scrollbar clips the content, the empty space of scrollbar-gutter: stable does not */
export function clipEdge(box: HTMLElement): number {
	const r = box.getBoundingClientRect();
	const style = getComputedStyle(box);
	const bar = style.overflowY === 'scroll' || (style.overflowY === 'auto' && box.scrollHeight > box.clientHeight + 1);
	return bar ? r.left + box.clientLeft + box.clientWidth : r.right - parseFloat(style.borderRightWidth);
}

/** the color behind the cards: the first painted background from the scroller out */
export function backdrop(from: HTMLElement): string {
	for (let n: HTMLElement | null = from; n; n = n.parentElement) {
		const bg = getComputedStyle(n).backgroundColor;
		if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
	}
	return getComputedStyle(document.body).backgroundColor;
}
