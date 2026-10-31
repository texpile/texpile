// where the image sits in the viewer: its scale and its top-left corner in the viewer's pixels
type Point = { x: number; y: number };

const MIN_SCALE = 0.05;
const MAX_SCALE = 32;
// room kept around an image fitted to the viewer
const FIT_MARGIN = 24;
const STEPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

export class ImageViewport {
	natural = $state({ w: 0, h: 0 });
	box = $state({ w: 0, h: 0 });
	scale = $state(1);
	x = $state(0);
	y = $state(0);
	/** follows the viewer's size until the reader zooms */
	fitted = $state(true);

	get fitScale(): number {
		const { w, h } = this.natural;
		if (!w || !h || !this.box.w || !this.box.h) return 1;
		return Math.min(1, (this.box.w - 2 * FIT_MARGIN) / w, (this.box.h - 2 * FIT_MARGIN) / h);
	}

	private get center(): Point {
		return { x: this.box.w / 2, y: this.box.h / 2 };
	}

	setNatural(w: number, h: number): void {
		this.natural = { w, h };
		if (this.fitted) this.fit();
		else this.keepInView();
	}

	setBox(w: number, h: number): void {
		this.box = { w, h };
		if (this.fitted) this.fit();
		else this.keepInView();
	}

	fit(): void {
		this.fitted = true;
		this.scale = Math.max(MIN_SCALE, this.fitScale);
		this.keepInView();
	}

	zoomTo(scale: number, at: Point = this.center): void {
		const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
		this.x = at.x - ((at.x - this.x) * next) / this.scale;
		this.y = at.y - ((at.y - this.y) * next) / this.scale;
		this.scale = next;
		this.fitted = false;
		this.keepInView();
	}

	zoomIn(at?: Point): void {
		this.zoomTo(STEPS.find((s) => s > this.scale + 1e-6) ?? MAX_SCALE, at);
	}

	zoomOut(at?: Point): void {
		this.zoomTo([...STEPS].reverse().find((s) => s < this.scale - 1e-6) ?? MIN_SCALE, at);
	}

	pan(dx: number, dy: number): void {
		this.x += dx;
		this.y += dy;
		this.keepInView();
	}

	/** an image smaller than the viewer stays centered; a larger one keeps covering it */
	private keepInView(): void {
		const w = this.natural.w * this.scale;
		const h = this.natural.h * this.scale;
		this.x = w <= this.box.w ? (this.box.w - w) / 2 : Math.min(0, Math.max(this.box.w - w, this.x));
		this.y = h <= this.box.h ? (this.box.h - h) / 2 : Math.min(0, Math.max(this.box.h - h, this.y));
	}
}
