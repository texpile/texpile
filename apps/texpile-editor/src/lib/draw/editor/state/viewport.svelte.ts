export type PictureRect = { x: number; y: number; w: number; h: number };

// the canvas draws bp at css px; a percent is of the figure's printed size, as the PDF viewer counts it
export const PX_PER_BP = 96 / 72;
const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.2;
const MAX_SCALE = 40;
const FIT_MARGIN_PX = 32;
// the tool bar floats over the top of the canvas
const TOOLBAR_PX = 48;
// however far the canvas is panned, this much of the sheet stays in view
const KEEP_IN_VIEW_PX = 96;

/** the canvas's window onto the picture: a center in bp (y up) and pixels per bp; it moves only when asked */
export class Viewport {
	#width = $state(0);
	#height = $state(0);
	cx = $state(0);
	cy = $state(0);
	scale = $state(2);
	fitted = $state(false);
	// the last fit, kept until the view is moved by hand: a fit asked for before the canvas had a size waits on it,
	// and a fitted view fits again when the canvas is resized
	#fitting: { rect: PictureRect; most: number } | null = null;
	/** what panning keeps in view: the sheet and the room around it */
	#limits: () => PictureRect | null = () => null;

	// a pane opening or the window resizing keeps the picture's middle where it was
	get width() {
		return this.#width;
	}
	set width(w: number) {
		this.#width = w;
		this.#refit();
		this.#keepInView();
	}
	get height() {
		return this.#height;
	}
	set height(h: number) {
		this.#height = h;
		this.#refit();
		this.#keepInView();
	}

	limitTo(limits: () => PictureRect | null) {
		this.#limits = limits;
	}

	#keepInView() {
		const r = this.#limits();
		if (!r || !this.#width || !this.#height) return;
		const halfW = this.#width / 2 / this.scale;
		const halfH = this.#height / 2 / this.scale;
		const keepX = Math.min(KEEP_IN_VIEW_PX / this.scale, r.w / 2);
		const keepY = Math.min(KEEP_IN_VIEW_PX / this.scale, r.h / 2);
		this.cx = Math.min(r.x + r.w + halfW - keepX, Math.max(r.x - halfW + keepX, this.cx));
		this.cy = Math.min(r.y + r.h + halfH - keepY, Math.max(r.y - halfH + keepY, this.cy));
	}

	#refit() {
		const f = this.#fitting;
		if (f && this.#width && this.#height) this.fit(f.rect, f.most);
	}

	/** svg viewBox in bp, y down */
	viewBox = $derived(
		`${this.cx - this.width / 2 / this.scale} ${-this.cy - this.height / 2 / this.scale} ${this.width / this.scale} ${this.height / this.scale}`
	);

	fit(rect: PictureRect, most = MAX_SCALE) {
		this.#fitting = { rect, most };
		if (!this.width || !this.height) return;
		const sx = (this.width - 2 * FIT_MARGIN_PX) / Math.max(rect.w, 1);
		const sy = (this.height - 2 * FIT_MARGIN_PX - TOOLBAR_PX) / Math.max(rect.h, 1);
		this.scale = Math.min(most, Math.max(MIN_SCALE, Math.min(sx, sy)));
		this.cx = rect.x + rect.w / 2;
		this.cy = rect.y + rect.h / 2 + TOOLBAR_PX / 2 / this.scale;
		this.fitted = true;
	}

	/** client px inside the canvas element to picture bp, y up */
	toPicture(px: number, py: number): [number, number] {
		return [this.cx + (px - this.width / 2) / this.scale, this.cy - (py - this.height / 2) / this.scale];
	}

	/** picture bp, y up, to px inside the canvas element */
	toScreen(x: number, y: number): [number, number] {
		return [(x - this.cx) * this.scale + this.width / 2, (this.cy - y) * this.scale + this.height / 2];
	}

	zoomAt(factor: number, px = this.width / 2, py = this.height / 2) {
		this.#fitting = null;
		const [x, y] = this.toPicture(px, py);
		this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
		this.cx = x - (px - this.width / 2) / this.scale;
		this.cy = y + (py - this.height / 2) / this.scale;
		this.#keepInView();
	}

	get percent() {
		return Math.round((this.scale / PX_PER_BP) * 100);
	}

	zoomToPercent(percent: number) {
		this.zoomAt(((percent / 100) * PX_PER_BP) / this.scale);
	}

	zoomIn() {
		this.zoomAt(ZOOM_STEP);
	}

	zoomOut() {
		this.zoomAt(1 / ZOOM_STEP);
	}

	panBy(dxPx: number, dyPx: number) {
		this.#fitting = null;
		this.cx -= dxPx / this.scale;
		this.cy += dyPx / this.scale;
		this.#keepInView();
	}
}
