/* eslint-disable @typescript-eslint/no-explicit-any */
// The preview's bitmap caches: figure images, tier-2 pixel crops (tikz/rotated material cut
// out of the reconcile PDF), and the exact-PDF resting rasters. Loading is async; each
// landed bitmap repaints its page through the hook.
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getPdfDocument } from '$lib/pdf-view';
import { fileUrl } from '$lib/workspace/fileSystem';
import type { PaperMetrics } from './locate/locate.types';

type BitmapHooks = {
	root: () => string;
	paper: () => PaperMetrics;
	dispScale: () => number;
	repaint: (n: number) => void;
	emit: (kind: string, detail?: unknown) => void;
};

type Slot = ImageBitmap | 'loading' | 'failed';

export class DraftBitmaps {
	// figure bitmaps, cached per file: PNG/JPG drawn directly, PDF figures rasterized once via
	// the app's shared pdf.js worker
	private imgCache = new Map<string, Slot>();
	// tier-2 pixel regions, keyed per page+rect; cleared on every compile success
	private pixCache = new Map<string, Slot>();
	private pixDoc: Promise<PDFDocumentProxy> | null = null;
	private pixGen = 0;
	// exact-PDF page rasters, keyed page@scale
	private baseCache = new Map<string, Slot>();
	// ~400dpi cap so deep zoom doesn't raster 30MP pages
	private static readonly BASE_MAX_PXPT = 5.5;

	constructor(private hooks: BitmapHooks) {}

	img(file: string): Slot | undefined {
		return this.imgCache.get(file);
	}
	hasImg(file: string): boolean {
		return this.imgCache.has(file);
	}
	pix(key: string): Slot | undefined {
		return this.pixCache.get(key);
	}
	base(key: string): Slot | undefined {
		return this.baseCache.get(key);
	}

	pixKey(pageNo: number, r: any): string {
		return `${pageNo}:${r.x.toFixed(2)},${r.y.toFixed(2)},${r.w.toFixed(2)},${r.h.toFixed(2)}`;
	}

	/** a new compile owns the PDF: drop every crop and raster taken from the old one */
	invalidate(): void {
		this.pixGen++;
		this.pixCache.clear();
		this.baseCache.clear(); // the exact-PDF page rasters come from THIS compile's PDF too
		this.pixDoc?.then((d) => d.loadingTask.destroy()).catch(() => {});
		this.pixDoc = null;
	}

	private openPdf(): Promise<PDFDocumentProxy> {
		if (!this.pixDoc)
			this.pixDoc = (async () => {
				// fetch bytes up front: range requests against a PDF latexmk may be rewriting would tear
				const buf = await (await fetch(fileUrl(this.hooks.root() + '/_draft/draft.pdf'), { cache: 'no-store' })).arrayBuffer();
				// eslint-disable-next-line id-denylist -- pdf.js getDocument's own field
				const task = await getPdfDocument({ data: buf });
				if (!task) throw new Error('no pdfjs');
				return task.promise;
			})();
		return this.pixDoc;
	}

	ensureImage(file: string, pageNo: number, wpx: number): void {
		if (this.imgCache.has(file)) return;
		this.imgCache.set(file, 'loading');
		void (async () => {
			try {
				let bmp: ImageBitmap;
				if (/\.pdf$/i.test(file)) {
					// getPdfDocument, not getDocument: task.destroy() below would otherwise take the shared
					// worker down with it, out from under the PDF viewer
					const task = await getPdfDocument({ url: fileUrl(file) });
					if (!task) throw new Error('no pdfjs');
					const doc = await task.promise;
					const pg = await doc.getPage(1);
					const base = pg.getViewport({ scale: 1 });
					// rasterize at ~2x the display size so zooming stays crisp, capped for huge figures
					const vp = pg.getViewport({ scale: Math.min(6, Math.max(1, (wpx * 2) / base.width)) });
					const c = document.createElement('canvas');
					c.width = Math.ceil(vp.width);
					c.height = Math.ceil(vp.height);
					await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise;
					bmp = await createImageBitmap(c);
					void task.destroy();
				} else {
					const blob = await (await fetch(fileUrl(file), { cache: 'force-cache' })).blob();
					bmp = await createImageBitmap(blob);
				}
				this.imgCache.set(file, bmp);
				this.hooks.emit('image-loaded', { file: file.split('/').pop(), page: pageNo });
				this.hooks.repaint(pageNo); // repaint with the real figure
			} catch (e) {
				this.imgCache.set(file, 'failed');
				this.hooks.emit('image-failed', { file: file.split('/').pop(), err: String(e).slice(0, 80) });
			}
		})();
	}

	ensurePixels(pageNo: number, r: any): void {
		const key = this.pixKey(pageNo, r);
		if (this.pixCache.has(key)) return;
		this.pixCache.set(key, 'loading');
		const gen = this.pixGen;
		void (async () => {
			try {
				const pg = await (await this.openPdf()).getPage(pageNo);
				// crop rect: records are pt from the (mx,my) text origin, PDF space is bp
				const PT2BP = 72 / 72.27;
				const paper = this.hooks.paper();
				const s = Math.min(8, Math.max(1, this.hooks.dispScale() * 2)); // ~2x display size so zooming stays crisp
				const cx = (paper.mx + r.x) * PT2BP * s;
				const cy = (paper.my + r.y - r.h) * PT2BP * s;
				const c = document.createElement('canvas');
				c.width = Math.max(1, Math.ceil(r.w * PT2BP * s));
				c.height = Math.max(1, Math.ceil((r.h + r.d) * PT2BP * s));
				const vp = pg.getViewport({ scale: s });
				// transparent background so the crop's edge can't erase a neighbour's overhang
				await pg.render({
					canvas: c,
					canvasContext: c.getContext('2d')!,
					viewport: vp,
					transform: [1, 0, 0, 1, -cx, -cy],
					background: 'rgba(0,0,0,0)'
				}).promise;
				const bmp = await createImageBitmap(c);
				if (gen !== this.pixGen) return; // a newer compile owns the cache now
				this.pixCache.set(key, bmp);
				this.hooks.emit('pixels-loaded', { page: pageNo, key });
				this.hooks.repaint(pageNo);
			} catch (e) {
				if (gen === this.pixGen) this.pixCache.set(key, 'failed');
				this.hooks.emit('pixels-failed', { page: pageNo, err: String(e).slice(0, 80) });
			}
		})();
	}

	basePxPt(dpr: number): number {
		return Math.min(this.hooks.dispScale() * dpr, DraftBitmaps.BASE_MAX_PXPT);
	}
	baseKey(n: number, dpr: number): string {
		return `${n}@${Math.round(this.basePxPt(dpr) * 100)}`;
	}
	requestBaseAuto(n: number): void {
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		this.requestBase(n, this.baseKey(n, dpr));
	}
	requestBase(n: number, key: string): void {
		if (this.baseCache.has(key)) return;
		this.baseCache.set(key, 'loading');
		const gen = this.pixGen;
		void (async () => {
			try {
				const pg = await (await this.openPdf()).getPage(n);
				// pdf space is bp; we want basePxPt pixels per TeX pt
				const scale = this.basePxPt(Math.min(2, window.devicePixelRatio || 1)) * (72.27 / 72);
				const vp = pg.getViewport({ scale });
				const c = document.createElement('canvas');
				c.width = Math.ceil(vp.width);
				c.height = Math.ceil(vp.height);
				await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp } as any).promise;
				const bmp = await createImageBitmap(c);
				if (gen !== this.pixGen) return;
				this.baseCache.set(key, bmp);
				this.hooks.emit('base-loaded', { page: n, key });
				this.hooks.repaint(n);
			} catch (e) {
				if (gen === this.pixGen) this.baseCache.set(key, 'failed');
				this.hooks.emit('base-failed', { page: n, err: String(e).slice(0, 80) });
				// a page HELD on its last frame waiting for this raster must fall back to records
				if (gen === this.pixGen) this.hooks.repaint(n);
			}
		})();
	}
}
