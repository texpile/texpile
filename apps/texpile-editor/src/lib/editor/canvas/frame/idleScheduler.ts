// idle slices: requestIdleCallback where the engine has one, else a deadline after the next frame on a MessageChannel
export type IdleSlice = { timeRemaining(): number };
export type IdleTask = (slice: IdleSlice) => void;
/** schedules one slice; returns the way to cancel it */
export type IdleScheduler = (task: IdleTask) => () => void;

/** what a slice may take where the engine gives no deadline (Safari) */
const FALLBACK_SLICE_MS = 5;

export function idleSchedulerOf(win: Window): IdleScheduler {
	if (typeof win.requestIdleCallback === 'function')
		return (task) => {
			const handle = win.requestIdleCallback((deadline) => task(deadline));
			return () => win.cancelIdleCallback(handle);
		};
	return (task) => {
		let cancelled = false;
		const frame = win.requestAnimationFrame(() => {
			const channel = new (win as Window & typeof globalThis).MessageChannel();
			channel.port1.onmessage = () => {
				channel.port1.close();
				if (cancelled) return;
				const end = win.performance.now() + FALLBACK_SLICE_MS;
				task({ timeRemaining: () => Math.max(0, end - win.performance.now()) });
			};
			channel.port2.postMessage(null);
		});
		return () => {
			cancelled = true;
			win.cancelAnimationFrame(frame);
		};
	};
}
