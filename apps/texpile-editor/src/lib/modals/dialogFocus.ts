// a dialog takes the keyboard as VS Code's do, and gives it back: Ctrl+Enter in Source Control's
// message box used to commit from under the main file dialog
export function takeFocus(card: HTMLElement) {
	const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	// a macrotask: fields that focus themselves on mount (autofocus is a microtask) go first
	const opening = setTimeout(() => {
		if (!card.contains(document.activeElement)) card.focus({ preventScroll: true });
	});
	return {
		destroy() {
			clearTimeout(opening);
			// unless what the dialog did put focus somewhere on purpose
			setTimeout(() => {
				const now = document.activeElement;
				if ((!now || now === document.body) && before?.isConnected) before.focus({ preventScroll: true });
			});
		}
	};
}
