// an edge being dragged, a divider between panes or the window's own, told to the panes so they hold what they drew
// from its first step

const grabbed = new Set<() => void>();
const released = new Set<() => void>();
let drags = 0;
let windowResized = -Infinity;

if (typeof window !== 'undefined') window.addEventListener('resize', () => (windowResized = performance.now()));

export function dividerDragging(): boolean {
	return drags > 0;
}

/** when the window last changed size; it says nothing when its edge is let go, so its panes rest on a timer */
export function windowResizedAt(): number {
	return windowResized;
}

/** a divider calls this as its drag starts and the returned function as it ends */
export function beginDividerDrag(): () => void {
	drags++;
	if (drags === 1) for (const tell of [...grabbed]) tell();
	let ended = false;
	return () => {
		if (ended) return;
		ended = true;
		drags--;
		if (drags === 0) for (const tell of [...released]) tell();
	};
}

export function onDividerGrab(tell: () => void): () => void {
	grabbed.add(tell);
	return () => grabbed.delete(tell);
}

export function onDividerRelease(tell: () => void): () => void {
	released.add(tell);
	return () => released.delete(tell);
}
