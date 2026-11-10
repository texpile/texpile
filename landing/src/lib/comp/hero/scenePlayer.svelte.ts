// plays the hero's take in a <video> and reports which of its parts is on screen
export class ScenePlayer {
	/** the part of the take on screen */
	chapter = $state(0);
	/** 0 to 1 through that part */
	chapterProgress = $state(0);
	/** reduced motion: the take stays paused, and a part click shows that part's last frame */
	still = $state(false);

	/** the second each part begins, in order */
	#starts: number[];
	#video: HTMLVideoElement | null = null;
	#raf = 0;

	constructor(starts: number[]) {
		this.#starts = starts;
	}

	/** starts playing the video; returns the teardown */
	attach(video: HTMLVideoElement): () => void {
		this.#video = video;
		this.chapter = 0;
		this.chapterProgress = 0;
		this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!this.still) {
			video.play().catch(() => {});
			this.#raf = requestAnimationFrame(this.#tick);
		}
		return () => {
			cancelAnimationFrame(this.#raf);
			if (this.#video === video) this.#video = null;
		};
	}

	/** another take's parts; its video attaches on its own */
	setStarts(starts: number[]): void {
		this.#starts = starts;
		this.chapter = 0;
		this.chapterProgress = 0;
	}

	/** plays the take from the start of part `index`; with reduced motion, shows that part's last frame */
	seekChapter(index: number): void {
		const video = this.#video;
		if (!video) return;
		this.chapter = index;
		if (this.still) {
			const show = () => (video.currentTime = this.#end(video, index) - 0.1);
			// the duration is unknown until the metadata is in, and nothing has asked for it yet
			if (Number.isFinite(video.duration)) show();
			else {
				video.addEventListener('loadedmetadata', show, { once: true });
				video.load();
			}
			this.chapterProgress = 1;
			return;
		}
		video.currentTime = this.#starts[index] ?? 0;
		video.play().catch(() => {});
	}

	#end(video: HTMLVideoElement, index: number): number {
		return this.#starts[index + 1] ?? video.duration;
	}

	#tick = () => {
		const video = this.#video;
		if (video && Number.isFinite(video.duration)) {
			const t = video.currentTime;
			let c = 0;
			while (c + 1 < this.#starts.length && this.#starts[c + 1] <= t) c++;
			const start = this.#starts[c];
			this.chapter = c;
			this.chapterProgress = Math.min((t - start) / (this.#end(video, c) - start), 1);
		}
		this.#raf = requestAnimationFrame(this.#tick);
	};
}
