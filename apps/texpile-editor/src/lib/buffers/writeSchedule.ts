// which files wait to be written, and when
export const AUTOSAVE_MS = 1500;

export class WriteSchedule {
	/** changed since the last write and not yet handed to the writer */
	readonly pending = new Set<string>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	/** writes that failed in a row, per file: the next try waits longer each time */
	private readonly failures = new Map<string, number>();

	constructor(
		private readonly flush: (rel: string) => void,
		/** a file in conflict waits for the choice */
		private readonly held: (rel: string) => boolean
	) {}

	/** debounce the next write */
	schedule(rel: string, delay = AUTOSAVE_MS): void {
		this.cancel(rel);
		if (this.held(rel)) return;
		this.timers.set(
			rel,
			setTimeout(() => {
				this.timers.delete(rel);
				this.flush(rel);
			}, delay)
		);
	}

	cancel(rel: string): void {
		clearTimeout(this.timers.get(rel));
		this.timers.delete(rel);
	}

	/** a write that did not land tries again on its own: a file a sync client or a virus scanner holds for a moment
	 *  would otherwise wait for the next keystroke */
	failed(rel: string): void {
		this.pending.add(rel);
		const tries = (this.failures.get(rel) ?? 0) + 1;
		this.failures.set(rel, tries);
		this.schedule(rel, Math.min(60_000, AUTOSAVE_MS * 2 ** tries));
	}

	landed(rel: string): void {
		this.failures.delete(rel);
	}

	/** nothing of the file waits any more */
	forget(rel: string): void {
		this.cancel(rel);
		this.pending.delete(rel);
		this.failures.delete(rel);
	}

	stop(): void {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
	}
}
