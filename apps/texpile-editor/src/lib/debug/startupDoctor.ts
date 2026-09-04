// Where a launch spends its time. The boot path drops marks at its real boundaries (settings
// read, start screen, folder listed, file read, parse, editor ready) and a PerformanceObserver
// keeps every main-thread task over 50ms. Slow resource loads (a chunk or wasm read from disk)
// are listed too, so a cold disk and a cold compile can be told apart. Four seconds after the
// first editor is ready the whole thing prints itself; window.texpileStartupDoctor() reprints it.

import { nativeBridge } from '$lib/workspace/fileSystem';

const PREFIX = 'texpile:';
const LONG_TASK_MS = 50;
const SLOW_LOAD_MS = 50;

const longTasks: { at: number; ms: number }[] = [];
let printed = false;

if (typeof PerformanceObserver !== 'undefined') {
	try {
		new PerformanceObserver((list) => {
			for (const e of list.getEntries())
				if (e.duration >= LONG_TASK_MS) longTasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) });
		}).observe({ type: 'longtask', buffered: true });
	} catch {
		/* not supported here */
	}
}
// the default buffer (250) fills before the workspace chunk even loads
try {
	performance.setResourceTimingBufferSize(4000);
} catch {
	/* best effort */
}

/** a boundary on the boot path; cheap enough to leave in production */
export function mark(name: string): void {
	try {
		performance.mark(PREFIX + name);
	} catch {
		/* marks are best effort */
	}
	if (name === 'editor-ready' && !printed) {
		printed = true;
		setTimeout(() => void startupDoctor(), 4000);
	}
}

export async function startupDoctor(): Promise<Record<string, unknown>> {
	const marks = performance
		.getEntriesByType('mark')
		.filter((m) => m.name.startsWith(PREFIX))
		.map((m) => ({ mark: m.name.slice(PREFIX.length), at: Math.round(m.startTime) }));
	const paint = performance.getEntriesByType('paint').map((p) => ({ mark: p.name, at: Math.round(p.startTime) }));
	const slowLoads = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
		.filter((r) => r.duration >= SLOW_LOAD_MS)
		.map((r) => ({
			file: r.name.split('/').pop()?.split('?')[0] ?? r.name,
			at: Math.round(r.startTime),
			ms: Math.round(r.duration),
			kb: Math.round(r.decodedBodySize / 1024)
		}));
	const blocked = longTasks.reduce((sum, t) => sum + t.ms, 0);
	// the main process reports epoch times; shift them onto this page's clock
	const main = await nativeBridge()
		?.startupMainStats?.()
		.catch(() => null);
	function onPageClock(s: { label: string; at: number; ms: number }) {
		return { ...s, at: Math.round(s.at - performance.timeOrigin) };
	}
	const mainHeld = (main?.stalls ?? []).map(onPageClock);
	const mainSpawns = (main?.spans ?? []).map(onPageClock);
	const out = {
		marks: [...paint, ...marks].sort((a, b) => a.at - b.at),
		longTasks: [...longTasks],
		slowLoads,
		mainHeld,
		mainSpawns,
		blockedMs: blocked
	};
	console.info('[startup] timeline; copy with: copy(window.texpileStartupDoctor())');
	console.table(out.marks);
	console.table(out.longTasks);
	console.table(out.slowLoads);
	console.table(out.mainHeld);
	console.table(out.mainSpawns);
	if (main?.profile) console.info(`[startup] main-process CPU profile, written 20 s after launch: ${main.profile}`);
	console.info(`[startup] main thread blocked for ${blocked} ms in ${longTasks.length} tasks over ${LONG_TASK_MS} ms`);
	return out;
}
