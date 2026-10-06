import type { HeroScene } from './heroScenes';
import { drawFrame, loadScene, type LoadedScene } from './loadScene';

// the last frame stays up this long before the next scene starts
const END_HOLD = 100;
const KEY_BADGE_MS = 1000;
// a background tab hands back one huge step when it wakes; never skip more than this
const MAX_STEP = 100;

export class ScenePlayer {
	active = $state(0);
	/** 0 to 1 through the active scene */
	progress = $state(0);
	/** the part of a take on screen, for a scene captured as one take in parts */
	chapter = $state(0);
	/** 0 to 1 through that part */
	chapterProgress = $state(0);
	keys = $state<string[] | null>(null);
	/** the pointer's place, as fractions of the window; null until the scene first moves it */
	pointer = $state<[number, number] | null>(null);
	/** hidden while typing; it comes back where it was and glides on from there */
	pointerShown = $state(false);
	/** false for its first place in a scene, so it shows up there instead of sliding in */
	pointerGlides = $state(false);
	/** goes up on every click, so the press replays */
	clicks = $state(0);
	/** the canvas has a frame on it, so the poster under it can go */
	drawn = $state(false);
	/** reduced motion: each scene is its last frame, and only a tab click changes it */
	still = $state(false);

	/** the format's scenes, in playing order */
	scenes: HeroScene[];
	#ctx: CanvasRenderingContext2D | null = null;
	#scene: LoadedScene | null = null;
	#clock = 0;
	#next = 0;
	#keysUntil = 0;
	#raf = 0;
	#last = 0;
	/** a part picked before its scene had loaded */
	#pendingChapter: number | null = null;

	constructor(scenes: HeroScene[]) {
		this.scenes = $state.raw(scenes);
	}

	/** starts playing on the canvas; returns the teardown */
	attach(canvas: HTMLCanvasElement): () => void {
		this.#ctx = canvas.getContext('2d');
		this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		this.select(this.active);
		if (!this.still) this.#raf = requestAnimationFrame(this.#tick);
		return () => cancelAnimationFrame(this.#raf);
	}

	select(index: number): void {
		this.active = index;
		this.#scene = null;
		this.#clock = 0;
		this.#next = 0;
		this.progress = 0;
		this.chapter = 0;
		this.chapterProgress = 0;
		this.keys = null;
		this.pointer = null;
		this.pointerShown = false;
		const scene = this.scenes[index];
		loadScene(scene).then(
			(loaded) => {
				if (this.scenes[this.active] !== scene) return;
				this.#scene = loaded;
				const pending = this.#pendingChapter;
				this.#pendingChapter = null;
				if (pending !== null) this.seekChapter(pending);
				else if (this.still) this.#showUntil(loaded, this.#chapterEnd(loaded, 0));
			},
			() => {}
		);
		// only the active sprite and the one after it are ever fetched
		if (!this.still) loadScene(this.scenes[(index + 1) % this.scenes.length]).catch(() => {});
	}

	/** another format's scenes, from the first */
	setScenes(scenes: HeroScene[]): void {
		this.scenes = scenes;
		this.select(0);
	}

	/** plays the take from the start of part `index`; with reduced motion, shows that part's last frame */
	seekChapter(index: number): void {
		const scene = this.#scene;
		if (!scene || !this.#ctx) {
			this.#pendingChapter = index;
			return;
		}
		const first = scene.chapters[index] ?? 0;
		this.chapter = index;
		this.keys = null;
		if (this.still) {
			this.#showUntil(scene, this.#chapterEnd(scene, index));
			return;
		}
		// frames only hold what changed, so the picture before the part is every frame up to it
		this.pointer = null;
		this.pointerShown = false;
		for (let i = 0; i < first; i++) {
			const f = scene.frames[i];
			drawFrame(this.#ctx, scene, f);
			if (f.hide) this.pointerShown = false;
			if (f.pointer) {
				this.pointer = f.pointer;
				this.pointerShown = true;
			}
		}
		this.pointerGlides = false;
		this.#next = first;
		this.#clock = this.#chapterStart(scene, index);
		this.drawn = true;
	}

	/** when part `index` begins: the moment the frame before it lands */
	#chapterStart(scene: LoadedScene, index: number): number {
		const first = scene.chapters[index] ?? 0;
		return first > 0 ? scene.at[first - 1] : 0;
	}

	/** the last frame of part `index`, or of the scene when it has no parts */
	#chapterEnd(scene: LoadedScene, index: number): number {
		const next = scene.chapters[index + 1];
		return next === undefined || !scene.chapters.length ? scene.frames.length - 1 : next - 1;
	}

	#showUntil(scene: LoadedScene, last: number): void {
		if (!this.#ctx) return;
		for (let i = 0; i <= last; i++) drawFrame(this.#ctx, scene, scene.frames[i]);
		this.drawn = true;
		this.progress = 1;
		this.chapterProgress = 1;
	}

	#tick = (now: number) => {
		const step = this.#last ? Math.min(now - this.#last, MAX_STEP) : 0;
		this.#last = now;
		const scene = this.#scene;
		if (scene && this.#ctx) {
			this.#clock += step;
			while (this.#next < scene.frames.length && scene.at[this.#next] <= this.#clock) this.#apply(scene, this.#next++);
			if (this.keys && this.#clock > this.#keysUntil) this.keys = null;
			const end = scene.length + END_HOLD;
			this.progress = Math.min(this.#clock / end, 1);
			if (scene.chapters.length) this.#trackChapter(scene, end);
			if (this.#clock >= end) this.select((this.active + 1) % this.scenes.length);
		}
		this.#raf = requestAnimationFrame(this.#tick);
	};

	#trackChapter(scene: LoadedScene, end: number): void {
		let c = 0;
		while (c + 1 < scene.chapters.length && this.#chapterStart(scene, c + 1) <= this.#clock) c++;
		const start = this.#chapterStart(scene, c);
		const stop = c + 1 < scene.chapters.length ? this.#chapterStart(scene, c + 1) : end;
		this.chapter = c;
		this.chapterProgress = Math.min((this.#clock - start) / (stop - start), 1);
	}

	#apply(scene: LoadedScene, i: number): void {
		const f = scene.frames[i];
		drawFrame(this.#ctx!, scene, f);
		this.drawn = true;
		if (f.hide) this.pointerShown = false;
		if (f.pointer) {
			this.pointerGlides = this.pointer !== null;
			this.pointer = f.pointer;
			this.pointerShown = true;
		}
		if (f.click) this.clicks++;
		if (f.keys) {
			this.keys = f.keys;
			this.#keysUntil = this.#clock + KEY_BADGE_MS;
		}
	}
}
