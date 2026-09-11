// a card's height, reported whenever it changes; the stacking needs real heights, not guesses
export function sized(node: HTMLElement, onSize: (height: number) => void) {
	const ro = new ResizeObserver(() => onSize(node.offsetHeight));
	ro.observe(node);
	onSize(node.offsetHeight);
	return {
		destroy() {
			ro.disconnect();
		}
	};
}
