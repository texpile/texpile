// The app's windows besides its own: what is drawn per window (a popover, a drop) and what is bound per window
// (a shortcut) reaches each of them through here
import { SvelteSet } from 'svelte/reactivity';

const open = new SvelteSet<Window>();

export const childWindows = {
	get list(): Window[] {
		return [...open];
	},
	/** returns the way to take it off again */
	add(win: Window): () => void {
		open.add(win);
		return () => open.delete(win);
	}
};

/** the app window `node` is drawn in */
export function windowOf(node: Node | null | undefined): Window {
	return node?.ownerDocument?.defaultView ?? window;
}

/** a screen point over this window or one of its children */
export function overAnyWindow(x: number, y: number): boolean {
	return [window, ...open].some(
		(w) => !w.closed && x >= w.screenX && x <= w.screenX + w.outerWidth && y >= w.screenY && y <= w.screenY + w.outerHeight
	);
}

/** called during component init: binds `handler` in each child window while it is open, as the component binds it here */
export function inChildWindows<K extends keyof WindowEventMap>(type: K, handler: (e: WindowEventMap[K]) => void, capture = false): void {
	$effect(() => {
		const wins = childWindows.list;
		for (const w of wins) w.addEventListener(type, handler, capture);
		return () => {
			for (const w of wins) w.removeEventListener(type, handler, capture);
		};
	});
}

/** the app window with focus, as VS Code's getActiveWindow: where a popover for what is being done opens */
export function activeWindow(): Window {
	return [...open].find((w) => !w.closed && w.document.hasFocus()) ?? window;
}

/** called during component init: binds `handler` in the window `node` is drawn in, as <svelte:window> does in this one */
export function onWindowOf<K extends keyof WindowEventMap>(
	node: () => Node | null | undefined,
	type: K,
	handler: (e: WindowEventMap[K]) => void
): void {
	$effect(() => {
		const win = windowOf(node());
		win.addEventListener(type, handler);
		return () => win.removeEventListener(type, handler);
	});
}
