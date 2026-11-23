// tinymist 0.15 can publish an older compile's problems after the newest one's (issue 174), and its
// publishes carry no version to tell them apart, so the project is compiled once more when it goes quiet
export const RECHECK_QUIET_MS = 800;

export class QuietRecheck {
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private onQuiet: () => void) {}

	edited(): void {
		this.restart();
	}

	/** a publish with no recheck pending is the recheck's own answer */
	published(): void {
		if (this.timer) this.restart();
	}

	stop(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	private restart(): void {
		this.stop();
		this.timer = setTimeout(() => {
			this.timer = null;
			this.onQuiet();
		}, RECHECK_QUIET_MS);
	}
}
