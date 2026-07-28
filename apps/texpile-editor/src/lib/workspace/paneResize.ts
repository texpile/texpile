// Shared plumbing for the workspace's drag handles (sidebar, TOC split, terminal dock, PDF pane).
// Each one used to carry its own copy of the same mousemove/mouseup dance plus a near-identical
// arrow-key nudge; the only real differences are how a pointer position maps to a value and what
// gets persisted, so both are parameters here.

interface DragOptions {
	/** pointer position -> the new value, or null to ignore this move (e.g. no measurable rect) */
	compute: (ev: MouseEvent) => number | null;
	apply: (value: number) => void;
	/** persist once the gesture ends, not on every frame */
	commit: () => void;
}

/** begin a drag gesture; listeners live on window so the pointer can leave the handle */
export function startDrag(e: MouseEvent, { compute, apply, commit }: DragOptions): void {
	e.preventDefault();
	const onMove = (ev: MouseEvent) => {
		const next = compute(ev);
		if (next !== null) apply(next);
	};
	const onUp = () => {
		window.removeEventListener('mousemove', onMove);
		window.removeEventListener('mouseup', onUp);
		commit();
	};
	window.addEventListener('mousemove', onMove);
	window.addEventListener('mouseup', onUp);
}

interface NudgeOptions {
	/** [key that decreases the value, key that increases it] */
	keys: [decrease: string, increase: string];
	step: number;
	current: () => number;
	apply: (value: number) => void;
	commit: () => void;
}

/** keyboard equivalent of a drag handle, so the panes stay resizable without a pointer */
export function nudgeOnKey(e: KeyboardEvent, { keys, step, current, apply, commit }: NudgeOptions): void {
	const [less, more] = keys;
	if (e.key !== less && e.key !== more) return;
	e.preventDefault();
	apply(current() + (e.key === more ? step : -step));
	commit();
}

export const clampTo = (min: number, max: number) => (v: number) => Math.min(max, Math.max(min, v));
