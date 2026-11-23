// the view's DOM: the root div.ProseMirror, the content rows and the caret canvas (2.5)
import type { PaintFrame } from '../contracts/engineTypes';
import type { DocPoint, DocRect } from '../contracts/layoutTypes';
import type { LayoutStyle } from '../contracts/styleTypes';
import { CanvasTiles, deviceSnapOf, placeOnDeviceGrid } from './tiles/canvasTiles';
import { NO_ROOT_BOX, rootBoxOf, rootOuterHeight, type RootBox } from './rootBox';

/** placed by a transform, so a caret move restyles one element and lays nothing out */
const CARET_STYLE = 'position:absolute;left:0;top:0;display:block;pointer-events:none;will-change:transform';
/** device pixels around the carets, for an antialiased edge */
const CARET_MARGIN_PX = 2;

/** the pane's box in view.dom's space, css px: what it shows of the document */
export type ShownBand = {
	readonly left: number;
	readonly width: number;
	readonly top: number;
	readonly height: number;
	readonly domHeight: number;
};

/** the scroller's client box in client px: what the pane shows, its scrollbar left out */
/* eslint-disable canvas/no-dom-measurement -- the pane's own box, not the document's */
function paneBox(scroller: HTMLElement): { left: number; top: number; width: number; height: number } {
	const doc = scroller.ownerDocument;
	if (scroller === doc.scrollingElement || scroller === doc.documentElement)
		return { left: 0, top: 0, width: scroller.clientWidth, height: scroller.clientHeight };
	const box = scroller.getBoundingClientRect();
	return {
		left: box.left + scroller.clientLeft,
		top: box.top + scroller.clientTop,
		width: scroller.clientWidth,
		height: scroller.clientHeight
	};
}
/* eslint-enable canvas/no-dom-measurement */

export class CanvasSurface {
	/** view.dom; its height is the document's */
	readonly dom: HTMLElement;
	/** the content rows, in view.dom's space */
	readonly tiles: CanvasTiles;
	/** over the rows, covering the carets alone, so a blink uploads a few pixels */
	readonly caret: HTMLCanvasElement;
	/** the zoom preference: layout runs unzoomed and paint, points and rects scale by it (D18) */
	zoom = 1;
	dpr = 1;
	/** the root box around the column, laid out from the root style each frame */
	root: RootBox = NO_ROOT_BOX;
	/** what the last place() found the pane showing */
	shown: ShownBand = { left: 0, width: 0, top: 0, height: 0, domHeight: 0 };
	private caretContext: CanvasRenderingContext2D | null = null;

	constructor(place: HTMLElement) {
		const doc = place.ownerDocument;
		this.dom = doc.createElement('div');
		this.dom.setAttribute('data-canvas-root', '');
		this.tiles = new CanvasTiles(doc);
		this.caret = doc.createElement('canvas');
		this.caret.setAttribute('data-canvas-caret', '');
		this.caret.style.cssText = CARET_STYLE;
		this.dom.append(this.tiles.host, this.caret);
		place.appendChild(this.dom);
	}

	/** while the view holds its first paint (readyGate.ts) the rows and carets are hidden; the input stays focusable */
	setHeld(held: boolean): void {
		const visibility = held ? 'hidden' : '';
		if (this.caret.style.visibility === visibility) return;
		this.caret.style.visibility = visibility;
		this.tiles.host.style.visibility = visibility;
		this.tiles.host.toggleAttribute('data-canvas-held', held);
	}

	/** the caret canvas resized to the device pixels around the bounds and placed over them, ctx mapping doc space */
	caretContextOver(bounds: DocRect | null, frame: PaintFrame): CanvasRenderingContext2D | null {
		const { caret, root } = this;
		if (!bounds) {
			caret.width = caret.height = 0;
			return null;
		}
		const scale = frame.dpr * frame.zoom;
		// device px from the snapped origin the tiles share, so the carets land on the same pixels as the text
		const ox = root.left * scale - this.tiles.snap.x;
		const oy = root.top * scale - this.tiles.snap.y;
		const left = Math.floor(bounds.x * scale + ox) - CARET_MARGIN_PX;
		const top = Math.floor(bounds.y * scale + oy) - CARET_MARGIN_PX;
		const width = Math.ceil((bounds.x + bounds.width) * scale + ox) + CARET_MARGIN_PX - left;
		const height = Math.ceil((bounds.y + bounds.height) * scale + oy) + CARET_MARGIN_PX - top;
		if (caret.width !== width) caret.width = width;
		if (caret.height !== height) caret.height = height;
		Object.assign(caret.style, {
			width: `${width / frame.dpr}px`,
			height: `${height / frame.dpr}px`,
			transform: `translate(${left / frame.dpr}px, ${top / frame.dpr}px)`
		});
		const ctx = (this.caretContext ??= caret.getContext('2d'));
		if (!ctx) return null;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, width, height);
		ctx.setTransform(scale, 0, 0, scale, ox - left, oy - top);
		return ctx;
	}

	/** the doc rect the pane shows: as wide as the pane from its left edge (gutter content paints and hits) */
	place(scroller: HTMLElement): DocRect {
		const view = this.dom.ownerDocument.defaultView;
		this.dpr = view?.devicePixelRatio || 1;
		const pane = paneBox(scroller);
		const box = this.dom.getBoundingClientRect();
		const top = Math.max(0, pane.top - box.top);
		const height = Math.max(0, Math.min(pane.top + pane.height, box.bottom) - Math.max(pane.top, box.top));
		this.shown = { left: pane.left - box.left, width: pane.width, top, height, domHeight: box.height };
		const snap = deviceSnapOf(box.left, box.top, this.dpr);
		if (this.tiles.setGrid({ left: this.shown.left, width: pane.width, dpr: this.dpr, snap }))
			placeOnDeviceGrid(this.caret, snap, this.dpr);
		const { zoom, root } = this;
		return { x: this.shown.left / zoom - root.left, y: top / zoom - root.top, width: pane.width / zoom, height: height / zoom };
	}

	/** a row of tiles as a doc rect: its backing store's, so the painter's map from doc space keeps the unsnapped one */
	rowRect(row: number): DocRect {
		const { zoom, root } = this;
		const box = this.tiles.rowBox(row);
		return { x: box.x / zoom - root.left, y: box.y / zoom - root.top, width: box.width / zoom, height: box.height / zoom };
	}

	/** the rows over the shown band, widened by `ahead` css px either way, within view.dom */
	rowsShown(ahead = 0): { first: number; last: number } {
		const { top, height, domHeight } = this.shown;
		return this.tiles.rowsOver(Math.max(0, top - ahead), Math.min(domHeight, top + height + ahead));
	}

	/** doc y of the first row the pane shows of the document */
	visibleTop(scroller: HTMLElement): number {
		return Math.max(0, paneBox(scroller).top - this.dom.getBoundingClientRect().top) / this.zoom - this.root.top;
	}

	/** whether an event's target is one of the canvases, whose events get a hit and a face target */
	isCanvas(target: EventTarget | null): boolean {
		return target === this.caret || this.tiles.has(target);
	}

	/** client px to doc space: the root's content box is the origin */
	docPoint(client: { x: number; y: number }): DocPoint {
		const box = this.dom.getBoundingClientRect();
		const { zoom, root } = this;
		return { x: (client.x - box.left) / zoom - root.left, y: (client.y - box.top) / zoom - root.top };
	}

	clientRect(rect: DocRect): DOMRect {
		const box = this.dom.getBoundingClientRect();
		const { zoom, root } = this;
		return new DOMRect(box.left + (rect.x + root.left) * zoom, box.top + (rect.y + root.top) * zoom, rect.width * zoom, rect.height * zoom);
	}

	/** the root's border box: the column with the page view's padding, what div.ProseMirror was in the DOM editor */
	sheetClientRect(): DOMRect {
		const box = this.dom.getBoundingClientRect();
		const { zoom, root } = this;
		const above = (root.top - root.insetTop) * zoom;
		const height = box.height - above - root.marginBottom * zoom;
		return new DOMRect(box.left + (root.left - root.insetLeft) * zoom, box.top + above, root.sheetWidth * zoom, Math.max(0, height));
	}

	/** the root box in view.dom's width, unzoomed; its content box is the column */
	layRoot(style: LayoutStyle): void {
		this.root = rootBoxOf(style, this.dom.getBoundingClientRect().width / this.zoom);
	}

	/** the column width blocks lay out at: the root's content width, unzoomed */
	columnWidth(): number {
		return this.root.width;
	}

	/** the document's height in the scroller, with the root's padding and margins */
	setHeight(height: number): void {
		const css = `${rootOuterHeight(this.root, height) * this.zoom}px`;
		if (this.dom.style.height !== css) this.dom.style.height = css;
	}

	/** the nearest ancestor that scrolls by its style, so a view with no height yet finds it too */
	scroller(): HTMLElement {
		const view = this.dom.ownerDocument.defaultView;
		for (let el = this.dom.parentElement; el; el = el.parentElement)
			// eslint-disable-next-line canvas/no-computed-style -- the pane's own scroller, an app element read once per view
			if (view && /auto|scroll/.test(view.getComputedStyle(el).overflowY)) return el;
		return (this.dom.ownerDocument.scrollingElement as HTMLElement | null) ?? this.dom.ownerDocument.documentElement;
	}

	destroy(): void {
		this.dom.remove();
	}
}
