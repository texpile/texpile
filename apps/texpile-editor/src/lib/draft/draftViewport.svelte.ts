// The preview's viewport: zoom and fit, page windowing (only visible pages hold a raster),
// scroll bookkeeping, Typst-style follow-the-edit, and the transient overlays (edit band,
// sync click mark).
import { tick } from 'svelte';
import type { PaperMetrics } from './locate/locate.types';
import { keepPointUnder } from '$lib/preview/zoom/zoomAnchor';

// 100% == actual physical size on a 96dpi display (matches the PDF viewer's zoom)
export const PT2PX = 96 / 72.27;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const PAGE_PAD = 16; // px gutter each side used by fit-width
const WINDOW_PAD = 2;
const FOLLOW_ZOOM = 1.08; // a tiny magnification above fit-width, the follow resting level

export type EditBand = { page: number; top: number; bottom: number; colL: number; colR: number };

type ViewportHooks = {
	canvas: (n: number) => HTMLCanvasElement | undefined;
	pageCount: () => number;
	recordsRaw: (n: number) => string;
	hasPatch: (n: number) => boolean;
	paper: () => PaperMetrics;
	renderPage: (n: number) => Promise<void>;
	emit: (kind: string, detail?: unknown) => void;
};

export class DraftViewport {
	zoom = $state(1);
	fitMode = $state(true); // re-fit to the pane width on resize until the user zooms
	containerW = $state(0); // measured inner width of the scroll area
	curPage = $state(1); // page under the viewport, for the toolbar indicator
	scroller = $state<HTMLDivElement | null>(null);
	followEdits = $state(true);
	// yellow highlight over the band being edited; faded out shortly after the typing stops
	editBand = $state<EditBand | null>(null);
	// click feedback: an instant ring pulse where a sync double-click landed (page-absolute pt)
	clickMark = $state<{ page: number; x: number; y: number } | null>(null);

	// viewport windowing: only paint visible pages +-2. Every page keeps its CSS-sized element
	// (scroll geometry), but only windowed pages hold a raster: at A4 x dpr2 each painted canvas
	// is ~14MB of backing store, and repainting every changed page after a reconcile stalled
	// typing O(pages) on long documents.
	winLo = 1;
	winHi = 3;
	readonly prevRecords = new Map<number, string>();

	private windowTimer: ReturnType<typeof setTimeout> | null = null;
	private rerenderTimer: ReturnType<typeof setTimeout> | null = null;
	private editBandTimer: ReturnType<typeof setTimeout> | null = null;
	private clickMarkTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private hooks: ViewportHooks) {}

	get dispScale(): number {
		return PT2PX * this.zoom; // CSS px per TeX pt
	}

	inWindow(n: number): boolean {
		return n >= this.winLo && n <= this.winHi;
	}

	updateWindow(): void {
		const s = this.scroller;
		const count = this.hooks.pageCount();
		if (!s || !count) return;
		const top = s.scrollTop;
		const bot = top + s.clientHeight;
		let lo = count;
		let hi = 1;
		for (let i = 0; i < count; i++) {
			const cv = this.hooks.canvas(i + 1);
			if (!cv) continue;
			const o = this.pageOrigin(cv).top;
			const h = cv.clientHeight || this.hooks.paper().h * this.dispScale;
			if (o < bot && o + h > top) {
				lo = Math.min(lo, i + 1);
				hi = Math.max(hi, i + 1);
			}
		}
		if (hi < lo) {
			lo = this.curPage;
			hi = this.curPage;
		}
		this.winLo = Math.max(1, lo - WINDOW_PAD);
		this.winHi = Math.min(count, hi + WINDOW_PAD);
		this.hooks.emit('window', { lo: this.winLo, hi: this.winHi, top: Math.round(top), bot: Math.round(bot) });
		for (let n = 1; n <= count; n++) {
			const cv = this.hooks.canvas(n);
			if (!cv) continue;
			if (this.inWindow(n) || this.hooks.hasPatch(n)) {
				if (this.prevRecords.get(n) !== this.hooks.recordsRaw(n) || cv.width === 0)
					void this.hooks.renderPage(n).then(() => this.prevRecords.set(n, this.hooks.recordsRaw(n)));
			} else if (cv.width > 0) {
				// free the backing store; the CSS box stays so scroll geometry doesn't move
				cv.width = 0;
				cv.height = 0;
				this.prevRecords.delete(n);
			}
		}
	}

	scheduleWindow(): void {
		if (this.windowTimer) clearTimeout(this.windowTimer);
		this.windowTimer = setTimeout(() => {
			this.windowTimer = null;
			this.updateWindow();
		}, 90);
	}

	// force the window onto a navigation/patch target so the scroll lands on painted pages
	paintAround(n: number): void {
		const count = this.hooks.pageCount();
		if (!count) return;
		this.winLo = Math.max(1, n - WINDOW_PAD);
		this.winHi = Math.min(count, n + WINDOW_PAD);
		for (let k = this.winLo; k <= this.winHi; k++) {
			const cv = this.hooks.canvas(k);
			if (!cv) continue;
			if (this.prevRecords.get(k) !== this.hooks.recordsRaw(k) || cv.width === 0)
				void this.hooks.renderPage(k).then(() => this.prevRecords.set(k, this.hooks.recordsRaw(k)));
		}
	}

	clampZoom(z: number): number {
		return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
	}
	fitToWidth(): void {
		const w = this.hooks.paper().w;
		if (!this.containerW || !w) return;
		this.zoom = this.clampZoom((this.containerW - PAGE_PAD * 2) / (w * PT2PX));
	}
	setZoom(z: number): void {
		this.fitMode = false;
		this.zoom = this.clampZoom(z);
	}
	/** a pinch or ctrl+wheel: the point under the pointer stays where it is */
	zoomAt(z: number, x: number, y: number): void {
		const s = this.scroller;
		if (!s) return this.setZoom(z);
		const pages: HTMLElement[] = [];
		for (let n = 1; n <= this.hooks.pageCount(); n++) {
			const cv = this.hooks.canvas(n);
			if (cv) pages.push(cv);
		}
		keepPointUnder(s, pages, x, y, () => {
			this.setZoom(z);
			this.applyCssSizes();
		});
	}
	zoomIn(): void {
		this.setZoom(this.zoom * 1.2);
	}
	zoomOut(): void {
		this.setZoom(this.zoom / 1.2);
	}
	actualSize(): void {
		this.setZoom(1);
	}
	fitWidthBtn(): void {
		this.fitMode = true;
		this.fitToWidth();
	}

	applyCssSizes(): void {
		const S = this.dispScale;
		const paper = this.hooks.paper();
		for (let n = 1; n <= this.hooks.pageCount(); n++) {
			const cv = this.hooks.canvas(n);
			if (!cv) continue;
			cv.style.width = paper.w * S + 'px';
			cv.style.height = paper.h * S + 'px';
		}
	}

	async rerenderAll(): Promise<void> {
		for (let n = 1; n <= this.hooks.pageCount(); n++) if (this.inWindow(n) || this.hooks.hasPatch(n)) await this.hooks.renderPage(n);
	}

	// Zoom re-renders the canvases at the new resolution so text stays crisp, but that's
	// O(pages) work; during a rapid gesture we resize the canvas CSS box immediately (the
	// browser scales the existing bitmap -- instant, a touch soft) and re-render once the
	// gesture settles.
	onZoomChanged(): void {
		this.applyCssSizes();
		if (this.rerenderTimer) clearTimeout(this.rerenderTimer);
		this.rerenderTimer = setTimeout(() => {
			this.rerenderTimer = null;
			void this.rerenderAll();
		}, 140);
	}

	// canvases sit inside position:relative wrappers (the tint/highlight overlays), so their
	// offsetTop/Left are relative to the WRAPPER (always ~0), not the scroller. Compute the page
	// origin within the scroller via bounding rects instead -- offsetTop here silently broke
	// followEdit, goToPage, and the page indicator when the wrappers became positioned.
	pageOrigin(cv: HTMLElement): { top: number; left: number } {
		const s = this.scroller!;
		const cr = cv.getBoundingClientRect();
		const sr = s.getBoundingClientRect();
		return { top: cr.top - sr.top + s.scrollTop, left: cr.left - sr.left + s.scrollLeft };
	}

	onScroll(): void {
		const s = this.scroller;
		if (!s || !this.hooks.pageCount()) return;
		// the page whose top is nearest the viewport top (a hair below it)
		const mid = s.scrollTop + 40;
		let best = 1,
			bestD = Infinity;
		for (let i = 0; i < this.hooks.pageCount(); i++) {
			const cv = this.hooks.canvas(i + 1);
			if (!cv) continue;
			const d = Math.abs(this.pageOrigin(cv).top - mid);
			if (d < bestD) {
				bestD = d;
				best = i + 1;
			}
		}
		this.curPage = best;
		this.scheduleWindow();
	}

	goToPage(n: number): void {
		const clamped = Math.min(this.hooks.pageCount(), Math.max(1, n));
		this.paintAround(clamped);
		const cv = this.hooks.canvas(clamped);
		if (cv && this.scroller) this.scroller.scrollTo({ top: this.pageOrigin(cv).top - 12, behavior: 'smooth' });
	}

	// Typst-style follow: on each patch, pan the preview so the edited paragraph sits near the
	// vertical center (and horizontally on its column), with a tiny one-time zoom-in toward a
	// stable resting level just above fit-width. The zoom only ever increases and settles there,
	// so repeated edits neither runaway-zoom nor pull back a view the user zoomed in further; if
	// they're already zoomed past it, we just pan. Bounds are record-space: a point (x, y) draws
	// at canvas (paper.mx + x, paper.my + y) * dispScale.
	followEdit(pageNo: number, bandTop: number, bandBottom: number, colL?: number, colR?: number): void {
		if (!this.followEdits || !this.scroller) return;
		this.paintAround(pageNo);
		const paper = this.hooks.paper();
		let zoomed = false;
		if (this.containerW && paper.w) {
			const target = this.clampZoom(((this.containerW - PAGE_PAD * 2) / (paper.w * PT2PX)) * FOLLOW_ZOOM);
			if (target > this.zoom + 1e-3) {
				this.setZoom(target);
				zoomed = true;
			}
		}
		const center = () => {
			const cv = this.hooks.canvas(pageNo);
			const s = this.scroller;
			if (!cv || !s) return;
			const S = this.dispScale;
			const org = this.pageOrigin(cv);
			const midY = org.top + (paper.my + (bandTop + bandBottom) / 2) * S;
			const toTop = Math.max(0, midY - s.clientHeight / 2);
			let toLeft = s.scrollLeft;
			if (colL != null && colR != null) {
				const midX = org.left + (paper.mx + (colL + colR) / 2) * S;
				toLeft = Math.max(0, Math.min(midX - s.clientWidth / 2, s.scrollWidth - s.clientWidth));
			}
			// skip a redundant scroll when the edit is already centered, so continuous typing in one
			// paragraph doesn't re-issue a smooth scroll every keystroke
			if (Math.abs(toTop - s.scrollTop) > 4 || Math.abs(toLeft - s.scrollLeft) > 4)
				s.scrollTo({ top: toTop, left: toLeft, behavior: 'smooth' });
		};
		if (zoomed)
			void tick().then(center); // wait for the zoom's css resize + reflow so offsets are current
		else center();
	}

	// holdMs: a recompile-bound highlight must outlive the compile it waits on (the landing
	// compile clears it anyway); the default fade covers ordinary typing
	showEditBand(b: EditBand, holdMs = 1600): void {
		this.editBand = b;
		if (this.editBandTimer) clearTimeout(this.editBandTimer);
		this.editBandTimer = setTimeout(() => {
			this.editBandTimer = null;
			this.editBand = null;
		}, holdMs);
	}
	clearEditBand(): void {
		this.editBand = null;
	}

	showClickMark(page: number, x: number, y: number): void {
		this.clickMark = { page, x, y };
		if (this.clickMarkTimer) clearTimeout(this.clickMarkTimer);
		this.clickMarkTimer = setTimeout(() => {
			this.clickMarkTimer = null;
			this.clickMark = null;
		}, 900);
	}
}
