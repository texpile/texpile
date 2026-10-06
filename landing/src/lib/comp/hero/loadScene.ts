import type { HeroScene } from './heroScenes';

/** one frame: after `delay` ms, copy each [sx, sy, w, h, dx, dy] patch from the sprite onto the canvas */
export type SceneFrame = {
	delay: number;
	blit: [number, number, number, number, number, number][];
	keys?: string[];
	/** where the pointer moves to, as fractions of the window's width and height */
	pointer?: [number, number];
	click?: boolean;
	/** the pointer hides, as it does while typing */
	hide?: boolean;
};

export type LoadedScene = {
	frames: SceneFrame[];
	/** when each frame lands, in ms from the start of the scene */
	at: number[];
	length: number;
	sprite: HTMLImageElement;
};

const loads = new Map<HeroScene, Promise<LoadedScene>>();

export function loadScene(scene: HeroScene): Promise<LoadedScene> {
	let p = loads.get(scene);
	if (!p) {
		p = (async () => {
			const sprite = new Image();
			sprite.src = scene.sprite;
			const [data] = await Promise.all([fetch(scene.timeline).then((r) => r.json()), sprite.decode()]);
			const frames: SceneFrame[] = data.timeline;
			let t = 0;
			const at = frames.map((f) => (t += f.delay));
			return { frames, at, length: t, sprite };
		})();
		// a failed fetch can be tried again on the next visit to the tab
		p.catch(() => loads.delete(scene));
		loads.set(scene, p);
	}
	return p;
}

export function drawFrame(ctx: CanvasRenderingContext2D, scene: LoadedScene, frame: SceneFrame): void {
	for (const [sx, sy, w, h, dx, dy] of frame.blit) ctx.drawImage(scene.sprite, sx, sy, w, h, dx, dy, w, h);
}
