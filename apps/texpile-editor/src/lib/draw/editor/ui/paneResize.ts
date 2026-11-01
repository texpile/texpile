export const SNAP_SLACK = 80;

type PaneDragOptions = {
	compute: (ev: MouseEvent) => number | null;
	apply: (value: number) => void;
};

type PaneNudgeOptions = {
	keys: [decrease: string, increase: string];
	step: number;
	current: () => number;
	apply: (value: number) => void;
};

export function startPaneDrag(e: MouseEvent, options: PaneDragOptions): void {
	if (e.button !== 0) return;
	e.preventDefault();
	function onMove(ev: MouseEvent) {
		const next = options.compute(ev);
		if (next !== null) options.apply(next);
	}
	function onUp() {
		window.removeEventListener('mousemove', onMove);
		window.removeEventListener('mouseup', onUp);
	}
	window.addEventListener('mousemove', onMove);
	window.addEventListener('mouseup', onUp);
}

export function nudgePaneOnKey(e: KeyboardEvent, options: PaneNudgeOptions): void {
	const [less, more] = options.keys;
	if (e.key !== less && e.key !== more) return;
	e.preventDefault();
	const step = e.shiftKey ? options.step * 4 : options.step;
	options.apply(options.current() + (e.key === more ? step : -step));
}

export function clampTo(min: number, max: number) {
	return (v: number) => Math.min(max, Math.max(min, v));
}
