// a proofread run lands reviews faster than a debounce waits, so they refresh the rows on a clock of their own and
// never stop a check that is running
export class ReviewRefresh {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = 0;
	private waiting = false;

	constructor(
		private ms: number,
		private check: () => Promise<void>
	) {}

	landed = (): void => {
		if (this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			if (this.running) this.waiting = true;
			else void this.run();
		}, this.ms);
	};

	/** every run of the check goes through here, so a review waits for the one in progress */
	async run(): Promise<void> {
		this.running++;
		try {
			await this.check();
		} finally {
			if (!--this.running && this.waiting) {
				this.waiting = false;
				this.landed();
			}
		}
	}

	cancel(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.waiting = false;
	}
}
