// Main-process half of the startup doctor. A 50 ms heartbeat notices whenever this thread was
// held (on Windows a spawn runs CreateProcess right here, and Defender holds that until it has
// scanned a fresh binary), and the spawn sites time themselves. A renderer that sat idle waiting
// for its own chunks, which this process serves, can then see what was going on meanwhile.
// Epoch timestamps, so the renderer can line them up with its own marks.
import { ipcMain } from 'electron';
import { startupProfilePath } from './startupProfile';

const TICK_MS = 50;
const STALL_MS = 100;
const SLOW_MS = 20;

type Span = { label: string; at: number; ms: number };
const stalls: Span[] = [];
const spans: Span[] = [];

let last = Date.now();
setInterval(() => {
	const now = Date.now();
	const held = now - last - TICK_MS;
	if (held >= STALL_MS) stalls.push({ label: 'main thread held', at: last, ms: held });
	last = now;
}, TICK_MS).unref();

/** a synchronous call worth watching, kept when it took a while */
export function timeSync<T>(label: string, fn: () => T): T {
	const t = Date.now();
	try {
		return fn();
	} finally {
		const ms = Date.now() - t;
		if (ms >= SLOW_MS) spans.push({ label, at: t, ms });
	}
}

/** an async step on the open path, always kept so overlaps show */
export async function timeSpan<T>(label: string, p: Promise<T>): Promise<T> {
	const t = Date.now();
	try {
		return await p;
	} finally {
		spans.push({ label, at: t, ms: Date.now() - t });
	}
}

export function registerStartupStatsIpc(): void {
	ipcMain.handle('startup:mainStats', () => ({ stalls, spans, profile: startupProfilePath() }));
}
