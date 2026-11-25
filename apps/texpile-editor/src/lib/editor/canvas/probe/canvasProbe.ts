// window.__canvasProbe (18.4): every mounted visual editor, for the integration specs, the drive kits and the perf gate
import type { CanvasProbe, ProbeView } from '../contracts/probeTypes';

type ProbeEntry = { readonly probe: ProbeView; hasFocus(): boolean };
/** texpileNative.canvasProbe: the preload's reading of TEXPILE_CANVAS_PROBE=1, which perf-drive sets */
type ProbeWindow = Window & { __canvasProbe?: CanvasProbe; texpileNative?: { canvasProbe?: boolean } };

const registries = new WeakMap<Window, ProbeEntry[]>();

export function probeEnabled(win: Window): boolean {
	return import.meta.env.DEV || import.meta.env.MODE === 'test' || !!(win as ProbeWindow).texpileNative?.canvasProbe;
}

/** the view's place among the window's canvas roots in document order: 0 is the first pane */
export function paneOrder(root: HTMLElement): string {
	return String([...root.ownerDocument.querySelectorAll('[data-canvas-root]')].indexOf(root));
}

/** active() is the focused editor, else the one mounted last */
export function registerProbeView(win: Window, entry: ProbeEntry): () => void {
	let entries = registries.get(win);
	if (!entries) {
		const list: ProbeEntry[] = [];
		registries.set(win, (entries = list));
		const probe: CanvasProbe = {
			views: () => list.map((each) => each.probe),
			active: () => (list.find((each) => each.hasFocus()) ?? list.at(-1))?.probe ?? null
		};
		Object.assign(win, { __canvasProbe: probe });
	}
	const list = entries;
	list.push(entry);
	return () => {
		const at = list.indexOf(entry);
		if (at >= 0) list.splice(at, 1);
	};
}
