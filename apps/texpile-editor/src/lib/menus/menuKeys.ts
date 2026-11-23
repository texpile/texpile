// the drawn menu's keys: Up and Down walk its items, Right opens a submenu, Left goes back to the menu

/** the item `dir` steps to from the focused one, wrapping round; the first or the last when none has the focus */
export function steppedItem(panel: HTMLElement, dir: 1 | -1): HTMLButtonElement | null {
	const items = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
	if (!items.length) return null;
	const at = items.indexOf(panel.ownerDocument.activeElement as HTMLButtonElement);
	return items[at < 0 ? (dir > 0 ? 0 : items.length - 1) : (at + dir + items.length) % items.length];
}
