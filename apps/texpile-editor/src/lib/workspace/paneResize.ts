// Shared plumbing for the workspace's drag handles (sidebar, TOC split, terminal dock, PDF pane).
// Each one used to carry its own copy of the same mousemove/mouseup dance plus a near-identical
// arrow-key nudge; the only real differences are how a pointer position maps to a value and what
// gets persisted, so both are parameters here.

import { beginDividerDrag } from '$lib/resizing/edgeDrag';

type DragOptions = {
	/** pointer position -> the new value, or null to ignore this move (e.g. no measurable rect) */
	compute: (ev: MouseEvent) => number | null;
	apply: (value: number) => void;
	/** persist once the gesture ends, not on every frame */
	commit: () => void;
	/**
	 * Called true on grab and false on release.
	 *
	 * Panes that are expensive to reflow (an iframe re-lays out its whole document) use this to hold
	 * their old size for the duration of the drag and take the cost once, on release.
	 */
	onState?: (dragging: boolean) => void;
};

/** begin a drag gesture; listeners live on window so the pointer can leave the handle */
export function startDrag(e: MouseEvent, { compute, apply, commit, onState }: DragOptions): void {
	e.preventDefault();
	onState?.(true);
	const endDrag = beginDividerDrag();
	function onMove(ev: MouseEvent) {
		const next = compute(ev);
		if (next !== null) apply(next);
	}
	function onUp() {
		window.removeEventListener('mousemove', onMove);
		window.removeEventListener('mouseup', onUp);
		onState?.(false);
		commit();
		endDrag();
	}
	window.addEventListener('mousemove', onMove);
	window.addEventListener('mouseup', onUp);
}

type NudgeOptions = {
	/** [key that decreases the value, key that increases it] */
	keys: [decrease: string, increase: string];
	step: number;
	current: () => number;
	apply: (value: number) => void;
	commit: () => void;
};

/** keyboard equivalent of a drag handle, so the panes stay resizable without a pointer */
export function nudgeOnKey(e: KeyboardEvent, { keys, step, current, apply, commit }: NudgeOptions): void {
	const [less, more] = keys;
	if (e.key !== less && e.key !== more) return;
	e.preventDefault();
	apply(current() + (e.key === more ? step : -step));
	commit();
}

export function clampTo(min: number, max: number) {
	return (v: number) => Math.min(max, Math.max(min, v));
}

/**
 * How far past its minimum a pane must be dragged before it snaps shut - and, from shut, how far
 * back out before it reopens. One threshold for both directions, so the boundary is in the same
 * place whichever way you are dragging and the pane cannot flicker around it.
 *
 * Below this the pointer is asking for a pane smaller than the pane can be, which in every editor
 * with this gesture means "close it", not "clamp it". Shared so the sidebar, the preview and the
 * dock all give way at the same distance.
 */
export const SNAP_SLACK = 80;
