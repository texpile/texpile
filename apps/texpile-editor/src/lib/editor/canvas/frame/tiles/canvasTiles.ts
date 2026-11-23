// the content canvases (2.5): rows of tiles in view.dom's own space, so the browser's scrolling moves the text with the
// scrollbar and the overlay layer, and a frame repaints only the rows whose content changed
/** device pixels per row, so a row's top is a whole device pixel at any DPR; a key repaints and uploads one or two */
export const TILE_DEVICE_PX = 256;

/** device px from view.dom's origin back to a whole device pixel, in (-1, 0] */
export type DeviceSnap = { readonly x: number; readonly y: number };

/** the pane's columns in view.dom's space, css px */
export type TileGrid = { readonly left: number; readonly width: number; readonly dpr: number; readonly snap: DeviceSnap };

/** a tile's backing store in view.dom's space, css px */
export type TileBox = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const NO_SNAP: DeviceSnap = { x: 0, y: 0 };
/** Chromium's layout units per px: client rects carry float noise below one unit, which must not move the grid */
const LAYOUT_UNITS_PER_PX = 64;

function backToWholePixel(client: number, dpr: number): number {
	const device = Math.round(client * dpr * LAYOUT_UNITS_PER_PX) / LAYOUT_UNITS_PER_PX;
	return Math.floor(device) - device || 0;
}

/** the snap of a client position: Chromium rounds a composited layer's paint offset and adds its translate unrounded */
export function deviceSnapOf(clientX: number, clientY: number, dpr: number): DeviceSnap {
	return { x: backToWholePixel(clientX, dpr), y: backToWholePixel(clientY, dpr) };
}

export type CanvasTile = { readonly row: number; readonly canvas: HTMLCanvasElement };

/** composited on its own, so a repaint uploads that row alone */
const TILE_STYLE = 'position:absolute;left:0;top:0;display:block;will-change:transform';

export class CanvasTiles {
	readonly host: HTMLElement;
	private readonly rows = new Map<number, CanvasTile>();
	/** what each row shows (tileContent.ts); none until it is painted */
	private readonly contents = new WeakMap<CanvasTile, unknown>();
	private readonly contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D | null>();
	private grid: TileGrid = { left: 0, width: 0, dpr: 1, snap: NO_SNAP };
	private opaque = true;

	constructor(doc: Document) {
		this.host = doc.createElement('div');
		this.host.setAttribute('data-canvas-tiles', '');
		this.host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0';
	}

	/** css px of one row */
	get rowHeight(): number {
		return TILE_DEVICE_PX / this.grid.dpr;
	}

	get dpr(): number {
		return this.grid.dpr;
	}

	get snap(): DeviceSnap {
		return this.grid.snap;
	}

	/** the rows that cover view.dom's css band [from, to) */
	rowsOver(from: number, to: number): { first: number; last: number } {
		const { dpr, snap } = this.grid;
		const first = Math.floor((from * dpr - snap.y) / TILE_DEVICE_PX);
		return { first: Math.max(0, first), last: Math.max(-1, Math.ceil((to * dpr - snap.y) / TILE_DEVICE_PX) - 1) };
	}

	/** what a row's backing store covers; its pixels are the screen's */
	rowBox(row: number): TileBox {
		const { dpr, snap } = this.grid;
		const { x, width } = this.columns();
		return { x: (x + snap.x) / dpr, y: (row * TILE_DEVICE_PX + snap.y) / dpr, width: width / dpr, height: TILE_DEVICE_PX / dpr };
	}

	/** a new pane box, DPR or snap resizes and clears every row; whether it did */
	setGrid(grid: TileGrid): boolean {
		const { left, width, dpr, snap } = this.grid;
		if (grid.left === left && grid.width === width && grid.dpr === dpr && grid.snap.x === snap.x && grid.snap.y === snap.y) return false;
		this.grid = grid;
		placeOnDeviceGrid(this.host, grid.snap, grid.dpr);
		for (const tile of this.rows.values()) this.fit(tile);
		return true;
	}

	/** a change of ground opacity makes new canvases (D17) */
	setOpaque(opaque: boolean): void {
		if (opaque === this.opaque) return;
		this.opaque = opaque;
		this.keep(0, -1);
	}

	/** the row's tile, made and placed on first use */
	tile(row: number): CanvasTile {
		let tile = this.rows.get(row);
		if (!tile) {
			const canvas = this.host.ownerDocument.createElement('canvas');
			canvas.setAttribute('data-canvas-content', '');
			canvas.style.cssText = TILE_STYLE;
			tile = { row, canvas };
			this.fit(tile);
			this.host.appendChild(canvas);
			this.rows.set(row, tile);
		}
		return tile;
	}

	at(row: number): CanvasTile | undefined {
		return this.rows.get(row);
	}

	/** the row's context mapping device pixels, null where the engine has no 2D canvas */
	context(tile: CanvasTile): CanvasRenderingContext2D | null {
		if (!this.contexts.has(tile.canvas)) this.contexts.set(tile.canvas, tile.canvas.getContext('2d', { alpha: !this.opaque }));
		return this.contexts.get(tile.canvas) ?? null;
	}

	/** rows outside [first, last] go, with their backing stores */
	keep(first: number, last: number): void {
		for (const [row, tile] of this.rows)
			if (row < first || row > last) {
				this.drop(tile);
				this.rows.delete(row);
			}
	}

	contentOf(tile: CanvasTile): unknown {
		return this.contents.get(tile) ?? null;
	}

	setContent(tile: CanvasTile, content: unknown): void {
		this.contents.set(tile, content);
	}

	has(target: EventTarget | null): boolean {
		return (target as Element | null)?.parentElement === this.host;
	}

	/** device pixels the rows hold */
	get pixels(): number {
		let sum = 0;
		for (const tile of this.rows.values()) sum += tile.canvas.width * tile.canvas.height;
		return sum;
	}

	/** the rows' columns in whole device px from the host's origin, covering the pane */
	private columns(): { x: number; width: number } {
		const { left, width, dpr, snap } = this.grid;
		const x = Math.floor(left * dpr - snap.x);
		// the right edge rounds in: a fraction of a pixel past the pane gave it a sideways scrollbar at 125 percent
		return { x, width: Math.floor((left + width) * dpr - snap.x) - x };
	}

	private fit(tile: CanvasTile): void {
		const { canvas } = tile;
		const { dpr } = this.grid;
		const { x, width } = this.columns();
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== TILE_DEVICE_PX) canvas.height = TILE_DEVICE_PX;
		Object.assign(canvas.style, {
			width: `${width / dpr}px`,
			height: `${TILE_DEVICE_PX / dpr}px`,
			transform: `translate(${x / dpr}px, ${(tile.row * TILE_DEVICE_PX) / dpr}px)`
		});
		this.contents.delete(tile);
	}

	private drop(tile: CanvasTile): void {
		Object.assign(tile.canvas, { width: 0, height: 0 });
		tile.canvas.remove();
	}
}

/** a layer moved back to a whole device pixel, so its paint offset has nothing for Chromium to round */
export function placeOnDeviceGrid(el: HTMLElement, snap: DeviceSnap, dpr: number): void {
	Object.assign(el.style, { left: `${snap.x / dpr}px`, top: `${snap.y / dpr}px` });
}
