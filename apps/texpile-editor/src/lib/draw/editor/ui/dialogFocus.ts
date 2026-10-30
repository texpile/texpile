// a dialog takes the keyboard while it is open and gives it back to what had it
export function takeFocus(card: HTMLElement) {
	const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const opening = setTimeout(() => {
		if (!card.contains(document.activeElement)) card.focus({ preventScroll: true });
	});
	return {
		destroy() {
			clearTimeout(opening);
			setTimeout(() => {
				const now = document.activeElement;
				if ((!now || now === document.body) && before?.isConnected) before.focus({ preventScroll: true });
			});
		}
	};
}
