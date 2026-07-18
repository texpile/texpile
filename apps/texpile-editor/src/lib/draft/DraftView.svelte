<script lang="ts">
	// Shows the engine's output on screen and splices instant patches into it.
	// Everything painted came from the real engine (page records, the exact PDF at rest,
	// daemon typesets while typing); a patch applies ONLY where the C1/C2/C3 predicates
	// prove a real recompile would produce the same page, else it demotes to a tinted
	// provisional + reconcile or an honest full pass.
	// KNOWN single-responsibility violation: this component still bundles four jobs --
	// painting (records/PDF), the locate ladder (matching daemon output to page records),
	// patch geometry (drop/shift/overflow), and patch verification. Splitting them means
	// threading the component's reactive state through a context object; planned, not done.
	// opentype.js 2.x ESM has no default export -- use the namespace (opentype.parse)
	import * as opentype from 'opentype.js';
	import { tick, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { ZoomIn, ZoomOut, MoveHorizontal, ChevronUp, ChevronDown, Crosshair, Download } from '@lucide/svelte';
	import { buildDrawList } from './renderCore';
	import { sfntFromTtc } from './ttc';
	import { parseT1, type T1Font } from './type1/t1font';
	import { getPdfJs } from 'svelte-pdf-view';
	import { native, fileUrl } from '$lib/workspace/fileSystem';
	import type { DraftPage } from '$lib/workspace/fileSystem';

	interface Props {
		root: string;
		mainFile: string;
		/** bump to trigger a recompile (e.g. on save / compile press). */
		trigger: number;
		/** SyncTeX inverse: a double-click on a page resolved to a source location. */
		onInverseSync?: (file: string, line: number, selectText?: string) => void;
		/** a compile landed: the editor re-evaluates any edits typed while it ran. */
		onSettled?: () => void;
	}
	let { root, mainFile, trigger, onInverseSync, onSettled }: Props = $props();

	let pages = $state<DraftPage[]>([]);
	let paper = $state({ w: 595, h: 842, colW: 0, fs: 0, mx: 72.27, my: 72.27 });
	let status = $state('');
	let error = $state<string | null>(null);
	let compiling = $state(false);
	let canvasEls: HTMLCanvasElement[] = $state([]);

	/* eslint-disable @typescript-eslint/no-explicit-any */
	// font ids are per-compile (the daemon numbers fonts independently of the page
	// compile), so cache parsed fonts by FILE PATH and map ids per record-set
	const fontByFile = new Map<string, { ot?: any; t1?: T1Font } | null>();
	// Type1 fonts are cached per (pfb, enc) pair: the same pfb can be reencoded differently
	const t1Key = (r: any) => r.t1.pfb + '|' + (r.t1.enc || '');
	// a .ttc collection holds several faces under one path: cache per (file, face)
	const otKey = (r: any) => (r.sub ? `${r.file}#${r.sub}` : r.file);
	const prevRecords = new Map<number, string>();
	const parsedPages = new Map<number, any[]>();
	const patchedPages = new Set<number>();
	// a live patch stays on screen after the fast path applies it; keep it so a zoom
	// re-render (which redraws from the untouched page records) re-applies it instead of
	// reverting. Cleared on a full compile (fresh records already carry the edit).
	const activePatch = new Map<number, Patch | Patch[]>(); // arrays = split patches (column spans)
	const BP2PT = 72.27 / 72; // synctex reports bp; records/paper dims are TeX pt
	// the daemon's box is \noindent; this prefix reproduces a TeX-indented paragraph's first line
	const INDENT_PREFIX = '\\hspace*{\\parindent}';

	// ---- zoom / view state ----
	// 100% == actual physical size on a 96dpi display (matches the PDF viewer's zoom).
	const PT2PX = 96 / 72.27;
	const MIN_ZOOM = 0.2,
		MAX_ZOOM = 5;
	const PAGE_PAD = 16; // px gutter each side used by fit-width
	let zoom = $state(1);
	let fitMode = $state(true); // re-fit to the pane width on resize until the user zooms
	let containerW = $state(0); // measured inner width of the scroll area
	let curPage = $state(1); // page under the viewport, for the toolbar indicator
	let scroller = $state<HTMLDivElement | null>(null);
	const dispScale = $derived(PT2PX * zoom); // CSS px per TeX pt

	// test hook: structured decision log readable from Playwright via window.__draftEvents
	// (renderer console.log isn't reliably relayed through _electron). Capped so a long
	// session can't grow it without bound.
	function ev(kind: string, detail?: unknown) {
		const w = window as unknown as { __draftEvents?: unknown[] };
		const a = (w.__draftEvents ||= []);
		a.push({ kind, detail, t: performance.now() });
		if (a.length > 200) a.splice(0, a.length - 200);
	}

	async function ensureFonts(records: any[]) {
		// a classic Type1 font record carries `t1` ({ pfb, enc }) instead of a parseable file
		const jobs: Promise<void>[] = [];
		const seen = new Set<string>();
		for (const r of records) {
			if (r.t !== 'font') continue;
			const key = r.t1 ? t1Key(r) : otKey(r);
			if (!key || fontByFile.has(key) || seen.has(key)) continue;
			seen.add(key);
			jobs.push(
				(async () => {
					try {
						if (r.t1) {
							const [pfb, enc] = await Promise.all([
								fetch(fileUrl(r.t1.pfb), { cache: 'force-cache' }).then((x) => x.arrayBuffer()),
								r.t1.enc ? fetch(fileUrl(r.t1.enc), { cache: 'force-cache' }).then((x) => x.text()) : null
							]);
							const t1 = parseT1(new Uint8Array(pfb), enc);
							fontByFile.set(key, t1 ? { t1 } : null);
						} else {
							const buf = await (await fetch(fileUrl(r.file), { cache: 'force-cache' })).arrayBuffer();
							fontByFile.set(key, { ot: opentype.parse(sfntFromTtc(buf, (r.sub || 1) - 1)) });
						}
					} catch {
						fontByFile.set(key, null);
					}
				})()
			);
		}
		await Promise.all(jobs);
	}
	function idMapFor(records: any[]): Record<number, { ot?: any; t1?: T1Font; size: number } | null> {
		const m: Record<number, { ot?: any; t1?: T1Font; size: number } | null> = {};
		for (const r of records) {
			if (r.t !== 'font') continue;
			const key = r.t1 ? t1Key(r) : otKey(r);
			const f = key ? fontByFile.get(key) : null;
			m[r.id] = f ? { ot: f.ot, t1: f.t1, size: r.size } : null;
		}
		return m;
	}
	// any glyph whose font the renderer cannot ink (no font record, failed fetch/parse):
	// the patch GEOMETRY is still engine-exact, but the live frame would show a silent
	// gap where that ink belongs -- the caller demotes to provisional so the state reads
	// as approximate until the exact-PDF base shows the real glyphs
	async function missingInk(records: any[]): Promise<boolean> {
		await ensureFonts(records);
		const idMap = idMapFor(records);
		for (const r of records) if (r.t === 'g' && !idMap[r.f]) return true;
		return false;
	}

	// figure bitmaps, cached per file: PNG/JPG drawn directly, PDF figures rasterized once via
	// the app's shared pdf.js worker. Loading is async; the page repaints when a bitmap lands.
	const imgCache = new Map<string, ImageBitmap | 'loading' | 'failed'>();
	function ensureImage(file: string, pageNo: number, wpx: number) {
		if (imgCache.has(file)) return;
		imgCache.set(file, 'loading');
		(async () => {
			try {
				let bmp: ImageBitmap;
				if (/\.pdf$/i.test(file)) {
					const pdfjs = await getPdfJs();
					if (!pdfjs) throw new Error('no pdfjs');
					const doc = await pdfjs.getDocument({ url: fileUrl(file) }).promise;
					const pg = await doc.getPage(1);
					const base = pg.getViewport({ scale: 1 });
					// rasterize at ~2x the display size so zooming stays crisp, capped for huge figures
					const vp = pg.getViewport({ scale: Math.min(6, Math.max(1, (wpx * 2) / base.width)) });
					const c = document.createElement('canvas');
					c.width = Math.ceil(vp.width);
					c.height = Math.ceil(vp.height);
					await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise;
					bmp = await createImageBitmap(c);
					void doc.destroy();
				} else {
					const blob = await (await fetch(fileUrl(file), { cache: 'force-cache' })).blob();
					bmp = await createImageBitmap(blob);
				}
				imgCache.set(file, bmp);
				ev('image-loaded', { file: file.split('/').pop(), page: pageNo });
				renderPage(pageNo, activePatch.get(pageNo)); // repaint with the real figure
			} catch (e) {
				imgCache.set(file, 'failed');
				ev('image-failed', { file: file.split('/').pop(), err: String(e).slice(0, 80) });
			}
		})();
	}

	// tier-2 pixel regions: raw-PDF drawing (tikz/pgfplots, rotated material) the walker
	// can't paint from records -- cropped out of the reconcile PDF of the SAME compile
	// via pdf.js. Cache clears on every compile success (PDF and geometry both change).
	const pixCache = new Map<string, ImageBitmap | 'loading' | 'failed'>();
	let pixDoc: Promise<any> | null = null;
	let pixGen = 0;
	function pixKey(pageNo: number, r: any): string {
		return `${pageNo}:${r.x.toFixed(2)},${r.y.toFixed(2)},${r.w.toFixed(2)},${r.h.toFixed(2)}`;
	}
	function invalidatePixels() {
		pixGen++;
		pixCache.clear();
		baseCache.clear(); // the exact-PDF page rasters come from THIS compile's PDF too
		pixDoc?.then((d) => d.destroy()).catch(() => {});
		pixDoc = null;
	}
	function ensurePixels(pageNo: number, r: any) {
		const key = pixKey(pageNo, r);
		if (pixCache.has(key)) return;
		pixCache.set(key, 'loading');
		const gen = pixGen;
		(async () => {
			try {
				if (!pixDoc)
					pixDoc = (async () => {
						const pdfjs = await getPdfJs();
						if (!pdfjs) throw new Error('no pdfjs');
						// fetch bytes up front: range requests against a PDF latexmk may be rewriting would tear
						const buf = await (await fetch(fileUrl(root + '/_draft/draft.pdf'), { cache: 'no-store' })).arrayBuffer();
						return pdfjs.getDocument({ data: buf }).promise;
					})();
				const pg = await (await pixDoc).getPage(pageNo);
				// crop rect: records are pt from the (mx,my) text origin, PDF space is bp
				const PT2BP = 72 / 72.27;
				const s = Math.min(8, Math.max(1, dispScale * 2)); // ~2x display size so zooming stays crisp
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
				if (gen !== pixGen) return; // a newer compile owns the cache now
				pixCache.set(key, bmp);
				ev('pixels-loaded', { page: pageNo, key });
				renderPage(pageNo, activePatch.get(pageNo));
			} catch (e) {
				if (gen === pixGen) pixCache.set(key, 'failed');
				ev('pixels-failed', { page: pageNo, err: String(e).slice(0, 80) });
			}
		})();
	}

	// ---- exact-PDF resting view ----
	// At rest each visible page paints a pdf.js raster of _draft/draft.pdf -- pixel-exact by
	// construction (true fonts, figures, tikz). The record canvas remains the LIVE overlay
	// while typing (patch composites below) and the automatic fallback when the PDF is
	// truncated by document errors (records ship regardless -- shipout-hook independence).
	const baseCache = new Map<string, ImageBitmap | 'loading' | 'failed'>();
	const BASE_MAX_PXPT = 5.5; // ~400dpi cap so deep zoom doesn't raster 30MP pages
	function basePxPt(dpr: number) {
		return Math.min(dispScale * dpr, BASE_MAX_PXPT);
	}
	function requestBaseAuto(n: number) {
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		requestBase(n, `${n}@${Math.round(basePxPt(dpr) * 100)}`);
	}
	function requestBase(n: number, key: string) {
		if (baseCache.has(key)) return;
		baseCache.set(key, 'loading');
		const gen = pixGen;
		void (async () => {
			try {
				if (!pixDoc)
					pixDoc = (async () => {
						const pdfjs = await getPdfJs();
						if (!pdfjs) throw new Error('no pdfjs');
						const buf = await (await fetch(fileUrl(root + '/_draft/draft.pdf'), { cache: 'no-store' })).arrayBuffer();
						return pdfjs.getDocument({ data: buf }).promise;
					})();
				const pg = await (await pixDoc).getPage(n);
				// pdf space is bp; we want basePxPt pixels per TeX pt
				const scale = basePxPt(Math.min(2, window.devicePixelRatio || 1)) * (72.27 / 72);
				const vp = pg.getViewport({ scale });
				const c = document.createElement('canvas');
				c.width = Math.ceil(vp.width);
				c.height = Math.ceil(vp.height);
				await pg.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp } as any).promise;
				const bmp = await createImageBitmap(c);
				if (gen !== pixGen) return;
				baseCache.set(key, bmp);
				ev('base-loaded', { page: n, key });
				renderPage(n, activePatch.get(n));
			} catch (e) {
				if (gen === pixGen) baseCache.set(key, 'failed');
				ev('base-failed', { page: n, err: String(e).slice(0, 80) });
				// a page HELD on its last frame waiting for this raster must fall back to records
				if (gen === pixGen) renderPage(n, activePatch.get(n));
			}
		})();
	}
	function pageRecords(n: number): any[] {
		if (!parsedPages.has(n)) {
			const p = pages[n - 1];
			parsedPages.set(
				n,
				p
					? p.records
							.split('\n')
							.filter(Boolean)
							.map((l: string) => JSON.parse(l))
					: []
			);
		}
		return parsedPages.get(n)!;
	}

	// The body's bottom in record space: the shipout box baseline (ht) IS the footer line's
	// baseline, \footskip above it is the last body line. Capacity checks measure against
	// this; everything below it (the footer) is bottom-anchored and no patch may shift,
	// clip, or move it.
	const colBottomOf = (p: number) => {
		const m = pages[p - 1] as any;
		return m?.ht ? m.ht - paper.fs : m?.h || 1e9;
	};
	const contentFloor = (p: number) => colBottomOf(p) + 2;

	// (patch-time image records draw as placeholders: which FILE a daemon image box shows
	// was a JS dimension-match guess that could swap same-sized figures -- deleted. The
	// reconcile's compile attaches filenames engine-side and paints the real figure.)
	function drawRecs(ctx: CanvasRenderingContext2D, records: any[], S: number, dy = 0, pageNo = 0) {
		const idMap = idMapFor(records);
		const { ops } = buildDrawList(records, (id) => idMap[id] || null, S, { glyphFill: '#000', ruleFill: '#000' });
		ctx.save();
		ctx.translate(paper.mx * S, (paper.my + dy) * S);
		for (const op of ops) {
			if (op.kind === 'glyph') {
				op.path.fill = op.fill;
				op.path.draw(ctx);
			} else if (op.kind === 'rect') {
				ctx.fillStyle = op.fill;
				ctx.fillRect(op.x, op.y, op.w, op.h);
			} else if (op.kind === 'image') {
				const file = (op.rec as any)?.file as string | undefined;
				const bmp = file ? imgCache.get(file) : undefined;
				if (bmp && bmp !== 'loading' && bmp !== 'failed') {
					ctx.drawImage(bmp, op.x, op.y, op.w, op.h);
				} else {
					// unresolved or still loading -> geometry-exact placeholder
					ctx.fillStyle = '#e5e7eb';
					ctx.strokeStyle = '#9ca3af';
					ctx.fillRect(op.x, op.y, op.w, op.h);
					ctx.strokeRect(op.x, op.y, op.w, op.h);
					if (file && pageNo && !imgCache.has(file)) ensureImage(file, pageNo, op.w);
				}
			} else if (op.kind === 'pixels') {
				const bmp = pixCache.get(pixKey(pageNo, op.rec));
				if (bmp && bmp !== 'loading' && bmp !== 'failed') {
					ctx.drawImage(bmp, op.x, op.y, op.w, op.h);
				} else {
					// crop still rasterizing -> light geometry-exact placeholder
					ctx.fillStyle = '#f3f4f6';
					ctx.fillRect(op.x, op.y, op.w, op.h);
					if (pageNo) ensurePixels(pageNo, op.rec);
				}
			}
		}
		ctx.restore();
	}

	type Patch = {
		top: number;
		dropTop: number;
		dropBottom: number;
		delta: number;
		paraLeft: number;
		colL: number;
		colR: number;
		newRecs: any[];
		// shifted records landing past this y are dropped on THIS page (they are being
		// re-drawn at the top of the next page by the overflow split)
		clipBottom?: number;
		// records BELOW this y are outside the contiguous content flow (the isolated
		// page-number footer): never shift, clip, or move them
		flowBottom?: number;
	};

	// ---- viewport windowing: only paint visible pages +-2 ----
	// Every page keeps its CSS-sized element (scroll geometry), but only windowed pages hold
	// a raster: at A4 x dpr2 each painted canvas is ~14MB of backing store, and repainting
	// every changed page after a reconcile stalled typing O(pages) on long documents.
	const WINDOW_PAD = 2;
	let winLo = 1;
	let winHi = 3;
	const inWindow = (n: number) => n >= winLo && n <= winHi;
	let windowTimer: ReturnType<typeof setTimeout> | null = null;
	function updateWindow() {
		if (!scroller || !pages.length) return;
		const top = scroller.scrollTop;
		const bot = top + scroller.clientHeight;
		let lo = pages.length;
		let hi = 1;
		for (let i = 0; i < pages.length; i++) {
			const cv = canvasEls[i];
			if (!cv) continue;
			const o = pageOrigin(cv).top;
			const h = cv.clientHeight || paper.h * dispScale;
			if (o < bot && o + h > top) {
				lo = Math.min(lo, i + 1);
				hi = Math.max(hi, i + 1);
			}
		}
		if (hi < lo) {
			lo = curPage;
			hi = curPage;
		}
		winLo = Math.max(1, lo - WINDOW_PAD);
		winHi = Math.min(pages.length, hi + WINDOW_PAD);
		ev('window', { lo: winLo, hi: winHi, top: Math.round(top), bot: Math.round(bot) });
		for (let n = 1; n <= pages.length; n++) {
			const cv = canvasEls[n - 1];
			if (!cv) continue;
			if (inWindow(n) || activePatch.has(n)) {
				if (prevRecords.get(n) !== pages[n - 1].records || cv.width === 0)
					void renderPage(n).then(() => prevRecords.set(n, pages[n - 1].records));
			} else if (cv.width > 0) {
				// free the backing store; the CSS box stays so scroll geometry doesn't move
				cv.width = 0;
				cv.height = 0;
				prevRecords.delete(n);
			}
		}
	}
	function scheduleWindow() {
		if (windowTimer) clearTimeout(windowTimer);
		windowTimer = setTimeout(() => {
			windowTimer = null;
			updateWindow();
		}, 90);
	}
	// force the window onto a navigation/patch target so the scroll lands on painted pages
	function paintAround(n: number) {
		if (!pages.length) return;
		winLo = Math.max(1, n - WINDOW_PAD);
		winHi = Math.min(pages.length, n + WINDOW_PAD);
		for (let k = winLo; k <= winHi; k++) {
			const cv = canvasEls[k - 1];
			if (!cv) continue;
			if (prevRecords.get(k) !== pages[k - 1].records || cv.width === 0)
				void renderPage(k).then(() => prevRecords.set(k, pages[k - 1].records));
		}
	}

	async function renderPage(n: number, patch?: Patch | Patch[]) {
		const cv = canvasEls[n - 1];
		if (!cv) return;
		// windowed: plain repaints of off-screen pages wait for window entry; explicit patch
		// splices and pages carrying a live patch always paint (they are the user's focus)
		if (!patch && !activePatch.has(n) && !inWindow(n)) return;
		// a plain re-render (e.g. after a zoom) must re-apply any live patch on this page
		patch = patch ?? activePatch.get(n);
		const patches: Patch[] = !patch ? [] : Array.isArray(patch) ? patch : [patch];
		const records = pageRecords(n);
		await ensureFonts(records);
		for (const p of patches) await ensureFonts(p.newRecs);
		const S = dispScale;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		cv.width = Math.round(paper.w * S * dpr);
		cv.height = Math.round(paper.h * S * dpr);
		cv.style.width = paper.w * S + 'px';
		cv.style.height = paper.h * S + 'px';
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, paper.w * S, paper.h * S);
		// exact-PDF base: paint the raster when it has landed for this compile+scale; the
		// records draw covers the page meanwhile (and permanently when the PDF is truncated)
		// the exact-PDF raster is the RESTING view only: pages carrying a live patch always
		// draw from records -- the proven splice renderer -- and snap to the pixel-exact
		// base when the patch clears on reconcile
		const bkey = `${n}@${Math.round(basePxPt(dpr) * 100)}`;
		const base = baseCache.get(bkey);
		if (!patches.length && base && base !== 'loading' && base !== 'failed') {
			ctx.drawImage(base, 0, 0, paper.w * S, paper.h * S);
			return;
		}
		if (!base) requestBase(n, bkey);
		if (!patches.length) {
			drawRecs(ctx, records, S, 0, n);
			return;
		}
		// column-aware 3-way split per SEGMENT (page-box-local pt): each record belongs to the
		// segment whose column contains it -- drop that segment's band, shift its below-band
		// content by its delta; records outside every segment stay put. The page-number footer
		// sits in the bottom margin (below the content box height) and is bottom-anchored by
		// TeX -- never shift it with the flow.
		const meta = pages[n - 1] as any;
		const contentBottom = (meta?.ht || meta?.h || Infinity) + 2;
		const unchanged: any[] = [];
		const shifted: any[][] = patches.map(() => []);
		for (const r of records) {
			if (r.t === 'font') {
				unchanged.push(r);
				for (const a of shifted) a.push(r);
				continue;
			}
			// no y = non-positional record (endx, note markers): pass through untouched. A
			// NEGATIVE y is real content -- beamer headlines sit above the reference origin,
			// and skipping them here silently erased slide titles from every patched render.
			if (r.y === undefined) {
				unchanged.push(r);
				continue;
			}
			const y = r.y;
			const x = r.x ?? -1e4;
			const pi = patches.findIndex((p) => x >= p.colL && x <= p.colR);
			if (pi < 0 || y > contentBottom) {
				unchanged.push(r);
				continue;
			}
			const p = patches[pi];
			if (y < p.dropTop) unchanged.push(r);
			else if (y > p.dropBottom) {
				if (p.flowBottom !== undefined && y > p.flowBottom) unchanged.push(r);
				else if (p.clipBottom === undefined || y + p.delta <= p.clipBottom) shifted[pi].push(r);
			}
		}
		drawRecs(ctx, unchanged, S, 0, n);
		patches.forEach((p, i) => {
			drawRecs(ctx, shifted[i], S, p.delta, n);
			drawRecs(
				ctx,
				p.newRecs.map((r) => (r.t === 'font' ? r : { ...r, x: (r.x ?? 0) + p.paraLeft, y: (r.y ?? 0) + p.top })),
				S,
				0,
				n
			);
		});
	}

	// ---- instant per-paragraph patch (the "no delay while typing" path) ----

	type Cal = {
		pageNo: number;
		b1: number;
		bk: number;
		medGap: number;
		paraLeft: number;
		W: number;
		colL: number;
		colR: number;
		// found by the fuzzy inverse map (right glyphs, line count off by one, e.g. the daemon's
		// \noindent vs an indented page paragraph): good enough for a PROVISIONAL patch that a
		// full compile reconciles, never for an exact one
		approx?: boolean;
		// the page paragraph is indented (TeX indents mid-section paragraphs; the daemon's box is
		// \noindent): re-typesets of this paragraph must carry the \parindent prefix to reproduce
		// the same breaks
		indent?: boolean;
		// the paragraph STRADDLES a column break: b1/bk/colL/colR describe the FIRST (reading
		// order) part; `spill` is the continuation at the top of the next column -- or, when
		// pageNo is set, at the top of a column on the NEXT PAGE. Split patches are always
		// provisional.
		spill?: { b1: number; bk: number; colL: number; colR: number; paraLeft: number; pageNo?: number };
	};
	// geometry located once per paragraph per compile; keystrokes reuse it
	const calCache = new Map<string, Cal | { bail: string }>();

	// plain-language reason a paragraph can't take the instant path (shown in the status)
	function whyPhrase(reason: string): string {
		switch (reason) {
			case 'spans-pages':
			case 'spans-boundary':
			case 'break-inside':
				return 'paragraph crosses a column or page';
			case 'overflow':
				return 'edit fills the column';
			case 'underflow':
				return 'edit shortens the column';
			case 'no-line-boxes':
			case 'no-anchor-glyphs':
			case 'no-page-records':
			case 'no-synctex-page':
			case 'no-page-glyphs':
			case 'no-run-of-N':
			case 'content-mismatch':
				return 'could not locate paragraph';
			case 'synctex-span>N':
			case 'line-count':
			case 'spread':
			case 'glue-gap':
				return 'layout no longer matches';
			case 'cal-uncertified':
			case 'cal-typeset-failed':
			case 'cal-empty':
			case 'typeset':
				return 'content the fast engine cannot reproduce';
			case 'no-lines':
				return 'nothing to typeset';
			default:
				return 'needs a full recompile';
		}
	}

	let patching = false;
	let patchingSince = 0;
	let queuedPatch: { file: string; line: number; endLine?: number; text: string; orig: string; transient?: boolean } | null = null;
	// pages showing a "close enough" provisional patch (the paragraph is exact, only the reflow
	// below is approximate) while a full compile reconciles the true layout -- tinted in the view
	let provisionalPages = $state(new Set<number>());
	// the reconcile after a provisional patch is DEBOUNCED: keep patching provisionally at typing
	// speed and run ONE full pass when the user pauses (an immediate recompile per keystroke lags)
	let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingReconcile: (() => void | Promise<void>) | null = null;
	function scheduleReconcile(onRecompile: (() => void | Promise<void>) | undefined, stage: string) {
		pendingReconcile = onRecompile ?? null;
		if (reconcileTimer) clearTimeout(reconcileTimer);
		reconcileTimer = setTimeout(async () => {
			reconcileTimer = null;
			const r = pendingReconcile;
			pendingReconcile = null;
			await r?.();
			compile('provisional:' + stage);
		}, 700);
	}
	// a structural edit (new/split/deleted paragraph) has no patch to follow -- the editor
	// registers the paragraph that diverged, and after the recompile lands we locate it in the
	// fresh layout (content-based) and jump + highlight it there
	let pendingFocus: { file: string; line: number; endLine: number; text: string; listItem?: boolean } | null = null;
	export function focusAfterCompile(req: NonNullable<typeof pendingFocus>) {
		pendingFocus = req;
	}
	// yellow highlight over the band being edited (record-space, from the located cal); shown on
	// each patch and faded out shortly after the typing stops
	let editBand = $state<{ page: number; top: number; bottom: number; colL: number; colR: number } | null>(null);
	let editBandTimer: ReturnType<typeof setTimeout> | null = null;
	function showEditBand(b: NonNullable<typeof editBand>) {
		editBand = b;
		if (editBandTimer) clearTimeout(editBandTimer);
		editBandTimer = setTimeout(() => {
			editBandTimer = null;
			editBand = null;
		}, 1600);
	}

	// Column-left candidates for a page. Clustering per-row leftmost-x finds a column only when
	// some row STARTS in it -- on a page where every col-2 row shares its baseline y with a col-1
	// row (flushbottom twocolumn grids align), the row minimum always lands in col 1 and col 2 is
	// invisible to it. So union in geometric candidates from the known \columnwidth: L0 + W +
	// default \columnsep, and right-anchored maxX - W. False candidates are harmless: callers
	// test candidates and a wrong column just yields losing runs.
	function colCandidates(allG: any[], W: number, G: number): number[] {
		const lineMinX = new Map<number, number>();
		for (const gl of allG) {
			const y = Math.round(gl.y);
			const c = lineMinX.get(y);
			if (c === undefined || gl.x < c) lineMinX.set(y, gl.x);
		}
		const leftCount = new Map<number, number>();
		for (const x of lineMinX.values()) {
			const k = Math.round(x);
			leftCount.set(k, (leftCount.get(k) || 0) + 1);
		}
		const uniq = [...leftCount.keys()].sort((a, b) => a - b);
		const cands: number[] = [];
		for (let i = 0; i < uniq.length; ) {
			let j = i,
				rep = uniq[i],
				rc = leftCount.get(uniq[i]) as number;
			while (j + 1 < uniq.length && uniq[j + 1] - uniq[i] <= W * 0.5) {
				j++;
				const c = leftCount.get(uniq[j]) as number;
				if (c > rc) {
					rc = c;
					rep = uniq[j];
				}
			}
			cands.push(rep);
			i = j + 1;
		}
		if (!cands.length) return cands;
		const L0 = Math.min(...cands);
		const maxRight = Math.max(...allG.map((g) => g.x as number));
		if (maxRight - L0 > 1.3 * W) for (const c of [L0 + W + 10, maxRight - W]) if (!cands.some((x) => Math.abs(x - c) <= G)) cands.push(c);
		return cands.sort((a, b) => a - b);
	}

	// Group glyphs into visual text rows (script baselines clustered like colBase), each a
	// codepoint sequence + x offsets sorted by x. Shared by all locate tiers.
	function rowsOfG(glyphs: any[], gap: number): { y: number; cs: number[]; xs: number[]; left: number }[] {
		const yc = new Map<number, any[]>();
		for (const g of glyphs) {
			const y = +g.y.toFixed(1);
			const a = yc.get(y);
			if (a) a.push(g);
			else yc.set(y, [g]);
		}
		const rawYs = [...yc.keys()].sort((a, b) => a - b);
		const out: { y: number; cs: number[]; xs: number[]; left: number }[] = [];
		for (let i = 0; i < rawYs.length; ) {
			let j = i,
				rep = rawYs[i];
			let all = yc.get(rawYs[i])!.slice();
			while (j + 1 < rawYs.length && rawYs[j + 1] - rawYs[j] <= gap * 0.45) {
				j++;
				const cur = yc.get(rawYs[j])!;
				if (cur.length > yc.get(rep)!.length) rep = rawYs[j];
				all = all.concat(cur);
			}
			all.sort((a, b) => a.x - b.x);
			out.push({
				y: rep,
				cs: all.map((g) => g.c as number),
				xs: all.map((g) => g.x as number),
				left: Math.min(...all.map((g) => g.x as number))
			});
			i = j + 1;
		}
		return out;
	}
	const eqSeq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
	// rows must agree on glyph X OFFSETS too, not just codepoints: error-recovered alignment
	// material (table rows) has the same sequence with totally different spacing
	const eqX = (a: { xs: number[] }, b: { xs: number[] }) =>
		a.xs.length === b.xs.length && a.xs.every((x, i) => Math.abs(x - a.xs[0] - (b.xs[i] - b.xs[0])) <= 0.5);
	// a located band IS this paragraph only if every row matches the daemon's reproduction,
	// glyph-for-glyph and offset-for-offset
	function bandMatchesCal(bandRows: { cs: number[]; xs: number[] }[], dRows: { cs: number[]; xs: number[] }[]): boolean {
		return bandRows.length === dRows.length && bandRows.every((r, i) => eqSeq(r.cs, dRows[i].cs) && eqX(r, dRows[i]));
	}

	// Forward path: synctex maps the paragraph's source line to its page boxes, snapped to the
	// column baseline grid. Fast and exact when synctex tags the line boxes to line 1 (the common
	// case). Anchor-related bails fall through to locateInverse below.
	async function locateForward(file: string, line: number, orig: string, listItem = false): Promise<Cal | { bail: string }> {
		const bail = (why: string, detail?: unknown) => {
			ev('locate-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
			return { bail: why };
		};
		const n = native()!;
		const sx: any = await n.synctex({ action: 'view', pdf: root + '/_draft/draft.pdf', tex: file, line, column: 0 });
		const boxes: any[] = (sx && sx.boxes) || [];
		const lineBoxes = boxes.filter((b) => (b.H || 0) < 30);
		if (!lineBoxes.length) return bail('no-line-boxes', { total: boxes.length, ok: sx?.ok, err: sx?.error });
		// F0: paragraph spans pages. Two CONSECUTIVE pages -> try the cross-page split locate
		// (band A ends page N's column, band B continues at a column top on page N+1); anything
		// wider or unmatched stays the recompile's job.
		const pagesSeen = [...new Set(lineBoxes.map((b) => b.page))].sort((a, b) => a - b);
		if (pagesSeen.length > 1) {
			if (pagesSeen.length === 2 && pagesSeen[1] === pagesSeen[0] + 1) {
				const xp = await locateCrossPage(lineBoxes, pagesSeen[0], pagesSeen[1], orig, listItem);
				if (!('bail' in xp)) return xp;
			}
			return bail('spans-pages', { pages: pagesSeen });
		}
		const pageNo = lineBoxes[0].page;
		const recs = pageRecords(pageNo);
		if (!recs.length) return bail('no-page-records', { pageNo });
		// the engine's exact \columnwidth (from the page compile manifest); calibrating the
		// daemon to this reproduces the page's line breaks. Fall back to the widest synctex
		// line box only if the manifest didn't carry it.
		const W = paper.colW > 0 ? paper.colW : Math.max(...lineBoxes.map((b) => b.W)) * BP2PT;
		const G = 8; // half-gutter tolerance for column membership
		const bys = [...new Set(lineBoxes.map((b) => +(b.y * BP2PT - paper.my).toFixed(1)))].sort((a, b) => a - b);
		const allG = recs.filter((x: any) => x.t === 'g');
		const colLefts = colCandidates(allG, W, G);
		if (!colLefts.length) return bail('no-columns');
		// The paragraph's column = the nearest column-left at or before the anchor's left edge.
		// Anchor by the synctex LINE BOX's own left (bl, exact; x sync-point as fallback), never
		// the leftmost glyph of that page ROW: on a grid-aligned two-column page the same row has
		// glyphs in BOTH columns, so a row minimum always lands in column 1 and every
		// right-column edit got measured against the left column's rows (spread/glue-gap
		// abandons on each keystroke).
		const aMin = Math.min(...lineBoxes.map((b) => (b.bl ?? b.x) * BP2PT - paper.mx));
		let colStart = colLefts[0];
		for (const cl of colLefts) {
			if (cl <= aMin + G) colStart = cl;
			else break;
		}
		const colL = colStart - G,
			colR = colStart + W + G;
		const inCol = (x: number) => x >= colL && x <= colR;
		// raw column baselines with glyph counts. A visual TEXT LINE is a cluster of these:
		// math sub/superscripts and fraction bars sit on nearby baselines with few glyphs.
		const yCount = new Map<number, number>();
		for (const x of allG)
			if (inCol(x.x)) {
				const y = +x.y.toFixed(1);
				yCount.set(y, (yCount.get(y) || 0) + 1);
			}
		const rawYs = [...yCount.keys()].sort((a, b) => a - b);
		// C1 calibration: the daemon must reproduce the UNEDITED paragraph exactly --
		// verifies fonts/size/indent/macros empirically (same engine, so if the unedited
		// text reproduces, the edited text is exact too)
		const cal = await native()!.draftTypeset({ root, mainFile, text: orig, hsize: W });
		if (!cal.ok) return bail('cal-typeset-failed');
		const calLines = cal.records.filter((x: any) => x.t === 'line');
		if (!calLines.length || (cal.stats && (cal.stats as any).certified === false))
			return bail('cal-uncertified', { lines: calLines.length, certified: (cal.stats as any)?.certified });
		// a zero-glyph reproduction (a float's content is discarded in the daemon's box) can
		// never certify a splice -- it would erase the region with blankness
		if (!cal.records.some((x: any) => x.t === 'g' || x.t === 'glyph')) return bail('cal-empty');
		const N = calLines.length;
		// line gap = the daemon's NATURAL body line gap. Robust; the whole column's median is
		// polluted on sparse pages (title/heading gaps between few baselines).
		const median = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
		const calGaps: number[] = [];
		for (let i = 1; i < calLines.length; i++) calGaps.push((calLines[i] as any).y - (calLines[i - 1] as any).y);
		const calGap = median(calGaps);
		// snapping tolerance; a 1-line orig has no calGap, so fall back to the smallest
		// recurring column gap, then a default
		let gap = calGap;
		if (!gap) {
			const cg: number[] = [];
			for (let i = 1; i < rawYs.length; i++) {
				const g = rawYs[i] - rawYs[i - 1];
				if (g > 2 && g < 20) cg.push(g);
			}
			gap = cg.length ? Math.min(...cg) : 12;
		}
		// collapse each cluster of nearby baselines (consecutive gap < ~0.45*gap) to ONE
		// text-line baseline -- the cluster member with the MOST glyphs (the main run of
		// text, not a super/subscript). So a math paragraph counts one baseline per visual
		// line instead of extra ones from `_i`/`^n`/fraction bars.
		const colBase: number[] = [];
		for (let i = 0; i < rawYs.length; ) {
			let j = i,
				rep = rawYs[i],
				repC = yCount.get(rawYs[i]) as number;
			while (j + 1 < rawYs.length && rawYs[j + 1] - rawYs[j] <= gap * 0.45) {
				j++;
				const c = yCount.get(rawYs[j]) as number;
				if (c > repC) {
					repC = c;
					rep = rawYs[j];
				}
			}
			colBase.push(rep);
			i = j + 1;
		}
		// use N (the daemon's exact line count) to DEFINE the band: snap the synctex
		// baselines to the column grid, then take exactly N contiguous baselines covering
		// them. Exact, instead of heuristic snapping that grabbed neighbouring paragraphs.
		const idxOf = (y: number) => {
			let bi = -1,
				bd = 1e9;
			for (let i = 0; i < colBase.length; i++) {
				const d = Math.abs(colBase[i] - y);
				if (d < bd) {
					bd = d;
					bi = i;
				}
			}
			return bd <= gap * 0.5 ? bi : -1;
		};
		const idxs = bys.map(idxOf).filter((i) => i >= 0);
		if (!idxs.length) return bail('anchor-off-grid');
		let lo = Math.min(...idxs),
			hi = Math.max(...idxs);
		if (hi - lo + 1 > N) return bail('synctex-span>N', { span: hi - lo + 1, N }); // spans / fragmented
		let need = N - (hi - lo + 1);
		while (need > 0 && hi + 1 < colBase.length && colBase[hi + 1] - colBase[hi] <= gap * 1.18) {
			hi++;
			need--;
		}
		while (need > 0 && lo - 1 >= 0 && colBase[lo] - colBase[lo - 1] <= gap * 1.18) {
			lo--;
			need--;
		}
		if (need > 0) return bail('spans-boundary', { N, got: hi - lo + 1 }); // runs off the column
		for (let i = lo; i < hi; i++) if (colBase[i + 1] - colBase[i] > gap * 1.5) return bail('break-inside');
		const b1 = colBase[lo],
			bk = colBase[hi];
		// paraLeft = where the daemon BOX ORIGIN sits on the page: the band's observed left
		// minus the daemon's own left for the same content. Both engine-measured, so content
		// that carries its own offset (list indent, \centering'd tabular, equation) recovers
		// the true galley origin and an edited re-typeset re-centers itself; box-anchored
		// prose (daemon left ~0) reduces to the band left.
		const band = allG.filter((x: any) => inCol(x.x) && x.y >= b1 - 0.5 && x.y <= bk + 0.5);
		const bandLeft = band.length ? Math.min(...band.map((x: any) => x.x)) : colStart;
		const dGl = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph');
		const dLeft = dGl.length ? Math.min(...dGl.map((x: any) => x.x as number)) : 0;
		const paraLeft = bandLeft - dLeft;
		const calSpread = (calLines[calLines.length - 1] as any).y - (calLines[0] as any).y;
		if (Math.abs(calSpread - (bk - b1)) > 0.7)
			return bail('spread', { calSpread: +calSpread.toFixed(1), pageSpread: +(bk - b1).toFixed(1) });
		// C2: the paragraph's OWN line spacing on the page must be natural (not glue-stretched
		// by vertical justification), else a rigid shift won't match TeX's redistribution.
		// Measure within the band, not the whole column; skip a single line (nothing to stretch).
		if (calGap) {
			const bandYs = colBase.filter((y) => y >= b1 - 0.5 && y <= bk + 0.5);
			const pageGaps: number[] = [];
			for (let i = 1; i < bandYs.length; i++) pageGaps.push(bandYs[i] - bandYs[i - 1]);
			const pageGap = median(pageGaps);
			if (pageGap && Math.abs(pageGap - calGap) > 0.5)
				return bail('glue-gap', { pageGap: +pageGap.toFixed(2), calGap: +calGap.toFixed(2) });
		}
		// content verification: the band must BE this paragraph (same glyphs, same offsets), not
		// merely a same-shaped one. Multi-file synctex misresolution (fragment paths, \par
		// attributed to the main file's \input line, file-local line collisions) can land on an
		// unrelated paragraph that passes every geometry check -- and a patch there would splice
		// the edit over the wrong content. Mismatch falls through to the glyph-fingerprint tier,
		// which searches by content.
		const bandRows = rowsOfG(
			allG.filter((g: any) => inCol(g.x) && g.y >= b1 - 0.5 && g.y <= bk + 0.5),
			gap
		);
		const dRows = rowsOfG(
			cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph'),
			gap
		);
		if (!dRows.length || !bandMatchesCal(bandRows, dRows)) return bail('content-mismatch', { band: bandRows.length, cal: dRows.length });
		return { pageNo, b1, bk, medGap: gap, paraLeft, W, colL, colR };
	}

	// Cross-PAGE split locate: the paragraph's first nA lines END a column on page A and the
	// remaining nB lines OPEN a column on page B. Both fragments are content-verified against
	// the daemon reproduction (rows + x offsets), so a match can't land on the wrong text. The
	// break row between the fragments is a first-order estimate -> always approx/provisional.
	async function locateCrossPage(
		lineBoxes: any[],
		pA: number,
		pB: number,
		orig: string,
		listItem: boolean
	): Promise<Cal | { bail: string }> {
		const bail = (why: string, detail?: unknown) => {
			ev('locate-xpage-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
			return { bail: why };
		};
		const recsA = pageRecords(pA);
		const recsB = pageRecords(pB);
		if (!recsA.length || !recsB.length) return bail('no-page-records');
		// \columnwidth is an engine register from the manifest; without it there is no
		// truthful hsize to reproduce line breaks at -- no invented default
		if (!(paper.colW > 0)) return bail('no-colwidth');
		const W = paper.colW;
		const G = 8;
		const median = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
		const variants: { glyphs: any[]; lines: any[]; indent: boolean }[] = [];
		for (const ind of listItem ? [false] : [false, true]) {
			const cal = await native()!.draftTypeset({ root, mainFile, text: (ind ? INDENT_PREFIX : '') + orig, hsize: W });
			if (!cal.ok) continue;
			const lines = cal.records.filter((x: any) => x.t === 'line');
			if (!lines.length || (cal.stats && (cal.stats as any).certified === false)) continue;
			const glyphs = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph');
			if (!glyphs.length) continue;
			variants.push({ glyphs, lines, indent: ind });
		}
		if (!variants.length) return bail('cal-typeset-failed');
		const calGaps: number[] = [];
		for (let i = 1; i < variants[0].lines.length; i++) calGaps.push((variants[0].lines[i] as any).y - (variants[0].lines[i - 1] as any).y);
		const gap = median(calGaps) || 12;
		const allGA = recsA.filter((x: any) => x.t === 'g');
		const allGB = recsB.filter((x: any) => x.t === 'g');
		if (!allGA.length || !allGB.length) return bail('no-page-glyphs');
		// prefer page A's synctex-anchored column, but fall back to every candidate
		const boxesA = lineBoxes.filter((b) => b.page === pA);
		const aMin = boxesA.length ? Math.min(...boxesA.map((b) => (b.bl ?? b.x) * BP2PT - paper.mx)) : null;
		const colsA = colCandidates(allGA, W, G);
		if (aMin !== null) colsA.sort((a, b) => Math.abs(a - aMin) - Math.abs(b - aMin));
		for (const v of variants) {
			const dRows = rowsOfG(v.glyphs, gap);
			const N = dRows.length;
			if (N < 2) continue;
			for (const clA of colsA) {
				const colLA = clA - G,
					colRA = clA + W + G;
				let rowsA = rowsOfG(
					allGA.filter((g: any) => g.x >= colLA && g.x <= colRA),
					gap
				);
				// drop up to two trailing isolated rows (page-number footer sits past a big gap)
				for (let d = 0; d < 2 && rowsA.length >= 2; d++) {
					if (rowsA[rowsA.length - 1].y - rowsA[rowsA.length - 2].y > gap * 2.2) rowsA = rowsA.slice(0, -1);
					else break;
				}
				if (!rowsA.length) continue;
				// band A = the longest PREFIX of dRows that matches the TAIL of the column
				let nA = 0;
				for (let k = Math.min(N - 1, rowsA.length); k >= 1 && !nA; k--) {
					let ok = true;
					for (let i = 0; i < k && ok; i++) {
						const pr = rowsA[rowsA.length - k + i];
						if (!eqSeq(pr.cs, dRows[i].cs) || !eqX(pr, dRows[i])) ok = false;
						else if (i > 0 && pr.y - rowsA[rowsA.length - k + i - 1].y > gap * 1.5) ok = false;
					}
					if (ok) nA = k;
				}
				if (!nA) continue;
				const nB = N - nA;
				for (const clB of colCandidates(allGB, W, G)) {
					const colLB = clB - G,
						colRB = clB + W + G;
					const rowsB = rowsOfG(
						allGB.filter((g: any) => g.x >= colLB && g.x <= colRB),
						gap
					);
					if (rowsB.length < nB) continue;
					// the continuation opens the column; allow skipping a few header rows above it
					for (let s = 0; s <= Math.min(3, rowsB.length - nB); s++) {
						let ok = true;
						for (let i = 0; i < nB && ok; i++) {
							const pr = rowsB[s + i];
							if (!eqSeq(pr.cs, dRows[nA + i].cs) || !eqX(pr, dRows[nA + i])) ok = false;
							else if (i > 0 && pr.y - rowsB[s + i - 1].y > gap * 1.5) ok = false;
						}
						if (!ok) continue;
						const bandA = rowsA.slice(rowsA.length - nA);
						const leftA = Math.min(...bandA.map((r) => r.left)) - Math.min(...dRows.slice(0, nA).map((r) => r.left));
						const bandB = rowsB.slice(s, s + nB);
						const leftB = Math.min(...bandB.map((r) => r.left)) - Math.min(...dRows.slice(nA).map((r) => r.left));
						ev('locate-xpage-ok', { pA, pB, nA, nB, indent: v.indent });
						return {
							pageNo: pA,
							b1: bandA[0].y,
							bk: bandA[nA - 1].y,
							medGap: gap,
							paraLeft: leftA,
							W,
							colL: colLA,
							colR: colRA,
							indent: v.indent,
							approx: true,
							spill: { pageNo: pB, b1: bandB[0].y, bk: bandB[nB - 1].y, colL: colLB, colR: colRB, paraLeft: leftB }
						};
					}
				}
			}
		}
		return bail('no-xpage-match');
	}

	// Inverse fallback for when the forward path can't anchor: synctex often tags a paragraph's
	// LINE boxes to the line that triggers its \par (the blank line after it, or \end{document}
	// for the last paragraph), not line 1 -- so forward(line 1) returns the wrong region (e.g. a
	// centered \maketitle above it) or nothing. Instead, ask synctex which source line each page
	// baseline came FROM (edit/inverse), keep the baselines whose source line is in the paragraph's
	// [line, endLine+1] range (its \par line included), and pick the contiguous run of exactly N
	// baselines whose glyph count matches the daemon's -- which rejects the centered title run and
	// the 1-glyph footer that also carry the \par line's tag. One synctex edit per candidate
	// baseline, windowed to the forward hint and run only on the (cached, rare) fallback.
	async function locateInverse(file: string, line: number, endLine: number, orig: string): Promise<Cal | { bail: string }> {
		const bail = (why: string, detail?: unknown) => {
			ev('locate-inverse-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
			return { bail: why };
		};
		const n = native()!;
		const pdf = root + '/_draft/draft.pdf';
		const fwd = async (ln: number): Promise<any[]> =>
			(((await n.synctex({ action: 'view', pdf, tex: file, line: ln, column: 0 })) as any)?.boxes as any[]) || [];
		let boxes = await fwd(line);
		if (!boxes.length) boxes = await fwd(endLine + 1);
		if (!boxes.length) return bail('no-synctex-page');
		const pageNo = boxes[0].page;
		const recs = pageRecords(pageNo);
		if (!recs.length) return bail('no-page-records');
		const allG = recs.filter((x: any) => x.t === 'g');
		if (!allG.length) return bail('no-page-glyphs');
		const W = paper.colW > 0 ? paper.colW : Math.max(...boxes.map((b) => b.W)) * BP2PT;
		const G = 8;
		const cal = await n.draftTypeset({ root, mainFile, text: orig, hsize: W });
		if (!cal.ok) return bail('cal-typeset-failed');
		const calLines = cal.records.filter((x: any) => x.t === 'line');
		if (!calLines.length || (cal.stats && (cal.stats as any).certified === false)) return bail('cal-uncertified');
		const N = calLines.length;
		const Gd = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph').length; // daemon glyph count
		if (!Gd) return bail('cal-empty'); // float/discarded content renders no glyphs; nothing to match
		const median = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
		const calGaps: number[] = [];
		for (let i = 1; i < calLines.length; i++) calGaps.push((calLines[i] as any).y - (calLines[i - 1] as any).y);
		const calGap = median(calGaps);
		const gap = calGap || 12;
		// window the inverse mapping to the forward hint (the paragraph's own box is tagged to
		// line 1, so its y is here even when the line boxes aren't): bounds the synctex edit calls
		// and drops a far-away footer/header from the candidate set
		const fwdYs = boxes.map((b) => b.y * BP2PT - paper.my);
		const winLo = Math.min(...fwdYs) - 5 * gap,
			winHi = Math.max(...fwdYs) + (N + 5) * gap;
		const colLefts = colCandidates(allG, W, G);
		type Run = { col: number; len: number; gcount: number; b1: number; bk: number; left: number };
		const runs: Run[] = [];
		for (const cl of colLefts) {
			const colL = cl - G,
				colR = cl + W + G,
				inCol = (x: number) => x >= colL && x <= colR;
			const yc = new Map<number, number>();
			for (const x of allG)
				if (inCol(x.x)) {
					const y = +x.y.toFixed(1);
					yc.set(y, (yc.get(y) || 0) + 1);
				}
			const rawYs = [...yc.keys()].sort((a, b) => a - b);
			const base: number[] = [],
				cnt: number[] = [],
				left: number[] = [];
			for (let i = 0; i < rawYs.length; ) {
				let j = i,
					rep = rawYs[i],
					rc = yc.get(rawYs[i]) as number;
				while (j + 1 < rawYs.length && rawYs[j + 1] - rawYs[j] <= gap * 0.45) {
					j++;
					const c = yc.get(rawYs[j]) as number;
					if (c > rc) {
						rc = c;
						rep = rawYs[j];
					}
				}
				const cys = rawYs.slice(i, j + 1),
					gls = allG.filter((x: any) => inCol(x.x) && cys.includes(+x.y.toFixed(1)));
				base.push(rep);
				cnt.push(gls.length);
				left.push(gls.length ? Math.min(...gls.map((x: any) => x.x)) : cl);
				i = j + 1;
			}
			// inverse-map every in-window baseline concurrently -> its source line. The line
			// number is only meaningful within the EDITED file: in a multi-file project every
			// fragment has a "line 45", so a hit from another file must not count.
			const wantBase = file.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
			const src: (number | null)[] = await Promise.all(
				base.map(async (y, i) => {
					if (y < winLo || y > winHi) return null;
					const ex: any = await n.synctex({
						action: 'edit',
						pdf,
						page: pageNo,
						x: (left[i] + 3 + paper.mx) / BP2PT,
						y: (y + paper.my) / BP2PT
					});
					if (!ex?.ok) return null;
					const inpBase = String(ex.input || '')
						.replace(/\\/g, '/')
						.split('/')
						.pop()!
						.toLowerCase();
					if (inpBase && inpBase !== wantBase) return null;
					return ex.line as number;
				})
			);
			for (let i = 0; i < base.length; ) {
				const inRange = (k: number) => src[k] != null && (src[k] as number) >= line && (src[k] as number) <= endLine + 1;
				if (!inRange(i)) {
					i++;
					continue;
				}
				let j = i;
				while (j + 1 < base.length && inRange(j + 1) && base[j + 1] - base[j] <= gap * 1.5) j++;
				runs.push({
					col: cl,
					len: j - i + 1,
					gcount: cnt.slice(i, j + 1).reduce((s, c) => s + c, 0),
					b1: base[i],
					bk: base[j],
					left: Math.min(...left.slice(i, j + 1))
				});
				i = j + 1;
			}
		}
		// an exact run must carry the daemon's glyph count too -- a same-line-count region with
		// different content is a different piece of the page, not this paragraph
		const exact = runs.filter((r) => r.len === N && Math.abs(r.gcount - Gd) <= Math.max(4, Gd * 0.02));
		if (!exact.length) {
			// two partial runs in DIFFERENT columns adding up to N (with the daemon's glyph count)
			// = the paragraph straddles a column break: return a SPLIT cal (first part + spill)
			// so the caller can render it provisionally instead of abandoning
			for (const a of runs)
				for (const b of runs) {
					if (a.col === b.col) continue;
					if (Math.abs(a.len + b.len - N) <= 1 && Math.abs(a.gcount + b.gcount - Gd) <= Gd * 0.15) {
						const [first, second] = a.col < b.col ? [a, b] : [b, a];
						ev('locate-inverse-span', { N, split: [first.len, second.len], pageNo });
						return {
							pageNo,
							b1: first.b1,
							bk: first.bk,
							medGap: gap,
							paraLeft: first.left,
							W,
							colL: first.col - G,
							colR: first.col + W + G,
							approx: true,
							spill: { b1: second.b1, bk: second.bk, colL: second.col - G, colR: second.col + W + G, paraLeft: second.left }
						};
					}
				}
			// a run whose GLYPHS match the daemon almost exactly but whose line count is off by
			// one (\noindent calibration vs an indented page paragraph): the right place, an
			// inexact break. Take it as an APPROX cal -- the caller renders it provisionally
			// (tinted) and reconciles with a full compile, instead of freezing on a recompile.
			const fuzzy = runs.filter((r) => Math.abs(r.len - N) <= 1 && Math.abs(r.gcount - Gd) <= Math.max(4, Gd * 0.02));
			if (fuzzy.length) {
				fuzzy.sort((a, b) => Math.abs(a.gcount - Gd) - Math.abs(b.gcount - Gd));
				const f = fuzzy[0];
				ev('locate-inverse-approx', { pageNo, b1: f.b1, bk: f.bk, len: f.len, N, gcount: f.gcount, Gd });
				return { pageNo, b1: f.b1, bk: f.bk, medGap: gap, paraLeft: f.left, W, colL: f.col - G, colR: f.col + W + G, approx: true };
			}
			return bail('no-run-of-N', { N, runs: runs.map((r) => ({ len: r.len, g: r.gcount })) });
		}
		exact.sort((a, b) => Math.abs(a.gcount - Gd) - Math.abs(b.gcount - Gd));
		const best = exact[0];
		const b1 = best.b1,
			bk = best.bk;
		const calSpread = (calLines[calLines.length - 1] as any).y - (calLines[0] as any).y;
		if (Math.abs(calSpread - (bk - b1)) > 0.7)
			return bail('spread', { calSpread: +calSpread.toFixed(1), pageSpread: +(bk - b1).toFixed(1) });
		if (calGap) {
			const inColB = (x: number) => x >= best.col - G && x <= best.col + W + G;
			const bys = [
				...new Set(allG.filter((x: any) => inColB(x.x) && x.y >= b1 - 0.5 && x.y <= bk + 0.5).map((x: any) => +(x.y as number).toFixed(1)))
			].sort((a, b) => a - b);
			const pg: number[] = [];
			for (let i = 1; i < bys.length; i++) pg.push(bys[i] - bys[i - 1]);
			const pageGap = median(pg);
			if (pageGap && Math.abs(pageGap - calGap) > 0.5)
				return bail('glue-gap', { pageGap: +pageGap.toFixed(2), calGap: +calGap.toFixed(2) });
		}
		ev('locate-inverse-ok', { pageNo, b1, bk, N, gcount: best.gcount, Gd });
		const invDGl = cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph');
		const invDLeft = invDGl.length ? Math.min(...invDGl.map((x: any) => x.x as number)) : 0;
		const paraLeft = best.left - invDLeft;
		// the inverse evidence is counts + attributions, never per-glyph content (that's the
		// glyph tier, which runs FIRST and already failed if we're here) -- so its result is
		// close-enough, not provable: render provisionally and reconcile
		return { pageNo, b1, bk, medGap: gap, paraLeft, W, colL: best.col - G, colR: best.col + W + G, approx: true };
	}

	// Glyph-fingerprint location: find the daemon's typeset of the UNEDITED paragraph on the page
	// by matching glyph codepoint rows. Pure content matching -- synctex only hints which page to
	// search, so synctex attribution fuzziness (the chief "could not locate" source) drops out of
	// the critical path. Indent-invariant (sequences, not x positions). An exact per-row match of
	// all N rows is stronger evidence than any synctex anchor; a same-glyphs different-breaks
	// match (daemon \noindent vs an indented paragraph) returns an approx cal for the provisional
	// path. Ambiguity (identical paragraph twice) bails rather than guessing.
	async function locateByGlyphs(
		file: string,
		line: number,
		endLine: number,
		orig: string,
		listItem: boolean
	): Promise<Cal | { bail: string }> {
		const bail = (why: string, detail?: unknown) => {
			ev('locate-glyph-bail', { why, ...(typeof detail === 'object' ? detail : { detail }) });
			return { bail: why };
		};
		const n = native()!;
		const pdf = root + '/_draft/draft.pdf';
		if (!(paper.colW > 0)) return bail('no-colwidth');
		const W = paper.colW;
		const G = 8;
		const median = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
		// TWO calibrations: TeX indents mid-section paragraphs but the daemon's box is \noindent,
		// which shifts the first line's break -- typeset both variants (~2ms each, once per
		// paragraph per compile) and match whichever the page actually has. The winning variant's
		// indent flag rides on the cal so edited re-typesets reproduce the same breaks.
		const variants: { lines: any[]; glyphs: any[]; indent: boolean }[] = [];
		for (const ind of listItem ? [false] : [false, true]) {
			const cal = await n.draftTypeset({ root, mainFile, text: (ind ? INDENT_PREFIX : '') + orig, hsize: W });
			if (!cal.ok) continue;
			const lines = cal.records.filter((x: any) => x.t === 'line');
			if (!lines.length || (cal.stats && (cal.stats as any).certified === false)) continue;
			variants.push({ lines, glyphs: cal.records.filter((x: any) => x.t === 'g' || x.t === 'glyph'), indent: ind });
		}
		if (!variants.length) return bail('cal-typeset-failed');
		const calGaps: number[] = [];
		for (let i = 1; i < variants[0].lines.length; i++) calGaps.push((variants[0].lines[i] as any).y - (variants[0].lines[i - 1] as any).y);
		const calGap = median(calGaps);
		const gap = calGap || 12;
		const rowsOf = (glyphs: any[]) => rowsOfG(glyphs, gap);
		const varRows = variants.map((v) => ({ rows: rowsOf(v.glyphs), indent: v.indent })).filter((v) => v.rows.length);
		if (!varRows.length) return bail('no-daemon-glyphs');
		const N = varRows[0].rows.length;
		// page search order: synctex page hints (reliable at page granularity even when its line
		// attribution isn't), then the rest
		const hintPages: number[] = [];
		for (const ln of [line, endLine + 1]) {
			const sx: any = await n.synctex({ action: 'view', pdf, tex: file, line: ln, column: 0 });
			for (const b of ((sx && sx.boxes) || []) as any[]) if (b.page && !hintPages.includes(b.page)) hintPages.push(b.page);
		}
		const order = [...hintPages, ...pages.map((p) => p.n).filter((p) => !hintPages.includes(p))];
		// tier 1: exact -- Nv contiguous rows, each glyph-identical to a calibration variant's row
		for (const pageNo of order) {
			const allG = pageRecords(pageNo).filter((x: any) => x.t === 'g');
			if (!allG.length) continue;
			for (const cl of colCandidates(allG, W, G)) {
				const colL = cl - G,
					colR = cl + W + G;
				const rows = rowsOf(allG.filter((x: any) => x.x >= colL && x.x <= colR));
				for (const v of varRows) {
					const dRows = v.rows,
						Nv = dRows.length;
					// placement anchor: band left minus daemon left = the daemon box origin on the
					// page (see locateForward's paraLeft note)
					const dLeft = Math.min(...dRows.map((r) => r.left));
					const starts: number[] = [];
					for (let s = 0; s + Nv <= rows.length; s++) {
						let okRun = true;
						for (let i = 0; i < Nv && okRun; i++) {
							if (!eqSeq(rows[s + i].cs, dRows[i].cs) || !eqX(rows[s + i], dRows[i])) okRun = false;
							else if (i > 0 && rows[s + i].y - rows[s + i - 1].y > gap * 1.5) okRun = false;
						}
						if (okRun) starts.push(s);
					}
					if (starts.length > 1) return bail('ambiguous', { matches: starts.length, pageNo });
					if (starts.length === 1) {
						const s = starts[0];
						const b1 = rows[s].y,
							bk = rows[s + Nv - 1].y;
						const paraLeft = Math.min(...rows.slice(s, s + Nv).map((r) => r.left)) - dLeft;
						// C2: natural band spacing -> exact. Stretched spacing (flushbottom
						// vertical justification) with content and x positions matching is still
						// the right paragraph in the right place: splice with natural spacing as
						// a close-enough PROVISIONAL and let the reconcile restore the stretch.
						if (calGap && Nv > 1) {
							const pg: number[] = [];
							for (let i = 1; i < Nv; i++) pg.push(rows[s + i].y - rows[s + i - 1].y);
							if (Math.abs(median(pg) - calGap) > 0.5) {
								ev('locate-glyph-stretched', { pageNo, b1, bk, N: Nv });
								return { pageNo, b1, bk, medGap: gap, paraLeft, W, colL, colR, indent: v.indent, approx: true };
							}
						}
						ev('locate-glyph-ok', { pageNo, b1, bk, N: Nv, indent: v.indent });
						return { pageNo, b1, bk, medGap: gap, paraLeft, W, colL, colR, indent: v.indent };
					}
				}
			}
		}
		const dRows = varRows[0].rows;
		const dLeft0 = Math.min(...dRows.map((r) => r.left));
		// tier 2: same glyphs, different breaks (indent shifts a line) -- slide a window of N+-1
		// contiguous rows and compare hyphen-stripped codepoint multisets. Hint pages only (the
		// multiset sweep is heavier than the early-exit exact compare).
		const HYPHENS = new Set([0x2d, 0xad, 0x2010]);
		const dAll: number[] = [];
		for (const r of dRows) for (const c of r.cs) if (!HYPHENS.has(c)) dAll.push(c);
		const dFreq = new Map<number, number>();
		for (const c of dAll) dFreq.set(c, (dFreq.get(c) || 0) + 1);
		const tol = Math.max(4, dAll.length * 0.02);
		type Fuzzy = { pageNo: number; b1: number; bk: number; left: number; colL: number; colR: number; diff: number; len: number };
		const found: Fuzzy[] = [];
		for (const pageNo of order.slice(0, Math.max(3, hintPages.length + 1))) {
			const allG = pageRecords(pageNo).filter((x: any) => x.t === 'g');
			if (!allG.length) continue;
			for (const cl of colCandidates(allG, W, G)) {
				const colL = cl - G,
					colR = cl + W + G;
				const rows = rowsOf(allG.filter((x: any) => x.x >= colL && x.x <= colR));
				for (const len of [N, N + 1, N - 1]) {
					if (len < 1) continue;
					for (let s = 0; s + len <= rows.length; s++) {
						let contiguous = true;
						for (let i = 1; i < len && contiguous; i++) if (rows[s + i].y - rows[s + i - 1].y > gap * 1.5) contiguous = false;
						if (!contiguous) continue;
						const freq = new Map<number, number>();
						let total = 0;
						for (let i = 0; i < len; i++)
							for (const c of rows[s + i].cs)
								if (!HYPHENS.has(c)) {
									freq.set(c, (freq.get(c) || 0) + 1);
									total++;
								}
						if (Math.abs(total - dAll.length) > tol) continue;
						let diff = 0;
						for (const [c, k] of dFreq) diff += Math.abs(k - (freq.get(c) || 0));
						for (const [c, k] of freq) if (!dFreq.has(c)) diff += k;
						if (diff <= tol)
							found.push({
								pageNo,
								b1: rows[s].y,
								bk: rows[s + len - 1].y,
								left: Math.min(...rows.slice(s, s + len).map((r) => r.left)) - dLeft0,
								colL,
								colR,
								diff,
								len
							});
					}
				}
			}
		}
		if (!found.length) return bail('not-on-page', { N });
		// windows of different lengths over the same paragraph overlap: group overlapping matches
		// and keep the best per group; >1 group = genuinely ambiguous
		found.sort((a, b) => a.pageNo - b.pageNo || a.b1 - b.b1);
		const groups: Fuzzy[][] = [];
		for (const f of found) {
			const g = groups[groups.length - 1];
			if (g && g[0].pageNo === f.pageNo && g[0].colL === f.colL && f.b1 <= g[g.length - 1].bk + gap) g.push(f);
			else groups.push([f]);
		}
		if (groups.length > 1) return bail('ambiguous', { matches: groups.length });
		const best = groups[0].sort((a, b) => a.diff - b.diff || Math.abs(a.len - N) - Math.abs(b.len - N))[0];
		ev('locate-glyph-approx', { pageNo: best.pageNo, b1: best.b1, bk: best.bk, len: best.len, N });
		return {
			pageNo: best.pageNo,
			b1: best.b1,
			bk: best.bk,
			medGap: gap,
			paraLeft: best.left,
			W,
			colL: best.colL,
			colR: best.colR,
			approx: true
		};
	}

	// Locate the paragraph: fast forward path; then glyph-fingerprint matching (content-based,
	// synctex-free); then the inverse synctex map (which can still name a column straddle).
	async function locate(file: string, line: number, orig: string, listItem = false, endLine = line): Promise<Cal | { bail: string }> {
		file = file.replace(/\\/g, '/'); // synctex stores forward-slash input paths; a backslash query finds nothing
		const fwd = await locateForward(file, line, orig, listItem);
		if (!('bail' in fwd)) return fwd;
		// anchor failures AND geometry mismatches both fall through: a spread/glue-gap bail is
		// just as often a mis-anchored window (wrong column, polluted rows) as a real stretch,
		// and the glyph tier verifies content + positions directly so it settles which it was
		const ANCHOR = new Set([
			'no-line-boxes',
			'no-anchor-glyphs',
			'anchor-off-grid',
			'synctex-span>N',
			'spans-boundary',
			'spread',
			'glue-gap',
			'line-count',
			'break-inside',
			'content-mismatch'
		]);
		if (!ANCHOR.has(fwd.bail)) return fwd;
		const gm = await locateByGlyphs(file, line, endLine, orig, listItem);
		if (!('bail' in gm)) return gm;
		// synctex often reports only ONE page of a page-straddling paragraph (its line boxes
		// carry the \par line's page), so the forward span check never fires -- when the
		// single-page tiers can't place it, probe the hinted page pairs for a cross-page split
		{
			const n = native()!;
			const pdf = root + '/_draft/draft.pdf';
			const hints = new Set<number>();
			for (const ln of [line, endLine + 1]) {
				const sx: any = await n.synctex({ action: 'view', pdf, tex: file, line: ln, column: 0 });
				for (const b of ((sx && sx.boxes) || []) as any[]) if (b.page) hints.add(b.page);
			}
			const tried = new Set<string>();
			for (const p of hints) {
				for (const [pa, pb] of [
					[p, p + 1],
					[p - 1, p]
				]) {
					if (pa < 1 || pb > pages.length || tried.has(pa + ':' + pb)) continue;
					tried.add(pa + ':' + pb);
					const xp = await locateCrossPage([], pa, pb, orig, listItem);
					if (!('bail' in xp)) return xp;
				}
			}
		}
		const inv = await locateInverse(file, line, endLine, orig);
		if (!('bail' in inv)) return inv;
		// the inverse's "straddles a column" is more precise than the forward's anchor failure
		return inv.bail === 'spans-boundary' ? inv : fwd;
	}

	/** Instant path: re-typeset one edited paragraph on the warm daemon and splice it
	 * into its page -- ONLY when provably identical to a full recompile; else abandon
	 * and recompile immediately. Called by the editor on every edit burst. */
	type PatchReq = {
		file: string;
		line: number;
		endLine?: number;
		text: string;
		orig: string;
		listItem?: boolean;
		transient?: boolean;
		floatInner?: boolean;
		// the edit changed the paragraph's SET of TeX commands: a command can carry
		// semantics invisible to glyph geometry, so the patch may render but never
		// claim exact -- the reconcile certifies (undetected drift beats no one)
		cmdChanged?: boolean;
		onRecompile?: () => void | Promise<void>;
	};
	export async function instantPatch(req: PatchReq) {
		const n = native();
		if (!n || !pages.length || compiling) {
			// while a compile is in flight, hold the latest edit; run it once compile finishes
			if (compiling) queuedPatch = req;
			ev('bail', !n ? 'no-native' : !pages.length ? 'no-pages' : 'compiling');
			return;
		}
		if (patching) {
			// a patch wedged mid-flight (a native call that never settled) must not swallow
			// every future edit silently: after 15s declare it dead and take over -- all the
			// daemon paths time out well under that, so the old run cannot still be live
			if (performance.now() - patchingSince > 15000) {
				ev('patch-stuck-reset', { since: Math.round(performance.now() - patchingSince) });
			} else {
				queuedPatch = req;
				ev('bail', 'patch-in-flight');
				return;
			}
		}
		patching = true;
		patchingSince = performance.now();
		const t0 = performance.now();
		// abandon -> save (so the recompile sees the buffer) + advance the editor's baseline,
		// then full-recompile
		const recompile = async (stage: string, detail?: unknown) => {
			// a TRANSIENT (auto-repaired mid-typing) edit may only patch or hold, never compile:
			// its source is a half-typed state not worth a full pass; the balanced keystroke
			// that follows re-evaluates normally
			if (req.transient) {
				ev('transient-hold', { stage });
				return;
			}
			ev('abandon', { stage, ...(typeof detail === 'object' ? detail : { detail }) });
			await req.onRecompile?.();
			// the daemon SURVIVES this: an abandon means "this edit renders via a full pass",
			// never an engine reload (that only happens on a preamble change)
			status = `Recompiling (${whyPhrase(stage)}), engine stays warm…`;
			compile('abandon:' + stage);
		};
		try {
			ev('patch-start', {
				file: req.file,
				line: req.line,
				origLen: req.orig.length,
				textLen: req.text.length,
				origHead: req.orig.slice(0, 50)
			});
			const key = `${req.file}:${req.line}`;
			let cal = calCache.get(key);
			if (!cal) {
				cal = await locate(req.file, req.line, req.orig, req.listItem, req.endLine);
				calCache.set(key, cal);
			}
			if ('bail' in cal) {
				await recompile(cal.bail, { key });
				return;
			}
			ev('located', { key, page: cal.pageNo });
			// cal.indent: the page paragraph is TeX-indented (the CALIBRATION discovered this
			// by typesetting both variants through the engine and matching the page), so the
			// edit carries the same engine-resolved \hspace*{\parindent}. An edit that changes
			// the paragraph's command set (e.g. typing \noindent) is cmdChanged and always
			// reconciles -- the engine certifies whatever the commands mean.
			const r = await n.draftTypeset({ root, mainFile, text: (cal.indent && !req.listItem ? INDENT_PREFIX : '') + req.text, hsize: cal.W });
			if (!r.ok || (r.stats && (r.stats as any).certified === false)) {
				await recompile('typeset', { ok: r.ok });
				return;
			}
			const lineRecs = r.records.filter((x: any) => x.t === 'line');
			if (!lineRecs.length) {
				await recompile('no-lines');
				return;
			}
			const h1 = (lineRecs[0] as any).h ?? 7;
			const dk = (lineRecs[lineRecs.length - 1] as any).d ?? 2;
			if (cal.spill) {
				// SPLIT patch: the paragraph straddles a column break. Fill column A from the
				// paragraph's top to its capacity, spill the remaining lines to column B's top,
				// shift B's content below by the spill-height change. Always provisional.
				const colBottomS = colBottomOf(cal.pageNo);
				const capA = Math.max(1, Math.floor((colBottomS - (cal.b1 - h1)) / cal.medGap));
				const kA = Math.min(lineRecs.length, capA);
				const cutY = kA >= lineRecs.length ? Infinity : ((lineRecs[kA - 1] as any).y + (lineRecs[kA] as any).y) / 2;
				const recsA = r.records.filter((x: any) => x.t === 'font' || (x.y ?? 0) < cutY);
				const recsB = r.records.filter((x: any) => x.t === 'font' || (x.y ?? 0) >= cutY);
				const yFirstB = kA < lineRecs.length ? (lineRecs[kA] as any).y : 0;
				const newSpillH = kA < lineRecs.length ? (lineRecs[lineRecs.length - 1] as any).y - yFirstB : -cal.medGap;
				const segA: Patch = {
					top: cal.b1 - h1,
					dropTop: cal.b1 - h1 - 2,
					dropBottom: cal.bk + cal.medGap * 0.6,
					delta: 0,
					paraLeft: cal.paraLeft,
					colL: cal.colL,
					colR: cal.colR,
					newRecs: recsA
				};
				const spillOn = cal.spill.pageNo ?? cal.pageNo;
				const segB: Patch = {
					top: cal.spill.b1 - yFirstB,
					dropTop: cal.spill.b1 - h1 - 2,
					dropBottom: cal.spill.bk + dk + 2,
					delta: newSpillH - (cal.spill.bk - cal.spill.b1),
					paraLeft: cal.spill.paraLeft,
					colL: cal.spill.colL,
					colR: cal.spill.colR,
					newRecs: kA < lineRecs.length ? recsB : [],
					flowBottom: contentFloor(spillOn)
				};
				const spillPage = cal.spill.pageNo ?? cal.pageNo;
				if (spillPage !== cal.pageNo) {
					// cross-PAGE split: one segment per page canvas
					activePatch.set(cal.pageNo, segA);
					activePatch.set(spillPage, segB);
					await renderPage(cal.pageNo, segA);
					await renderPage(spillPage, segB);
					patchedPages.add(spillPage);
					provisionalPages = new Set(provisionalPages).add(cal.pageNo).add(spillPage);
				} else {
					const segs = [segA, segB];
					activePatch.set(cal.pageNo, segs);
					await renderPage(cal.pageNo, segs);
					provisionalPages = new Set(provisionalPages).add(cal.pageNo);
				}
				patchedPages.add(cal.pageNo);
				showEditBand({ page: cal.pageNo, top: cal.b1 - h1, bottom: cal.bk + dk, colL: cal.colL, colR: cal.colR });
				followEdit(cal.pageNo, cal.b1, cal.bk, cal.colL, cal.colR);
				status = `Refining p${cal.pageNo}…`;
				ev('provisional-split', { page: cal.pageNo, spillPage, kA, of: lineRecs.length });
				if (!req.transient) scheduleReconcile(req.onRecompile, 'split');
				return;
			}
			// the band (cal.b1..bk) is measured in GLYPH-ROW baselines, so the daemon side must
			// be too: a tabular is ONE line record spanning the whole table (its baseline the
			// [c]-alignment center), and line-shape math placed it ~half a table off and read a
			// phantom under/overflow. Glyph rows are identical to line records for prose.
			const dRowsNew = rowsOfG(
				(r.records as any[]).filter((x: any) => x.t === 'g'),
				cal.medGap
			);
			const y0 = dRowsNew.length ? dRowsNew[0].y : ((lineRecs[0] as any).y ?? 0);
			const yk = dRowsNew.length ? dRowsNew[dRowsNew.length - 1].y : ((lineRecs[lineRecs.length - 1] as any).y ?? 0);
			const delta = yk - y0 - (cal.bk - cal.b1);
			// C3: the column/page break must not move. A delta<=0 edit (same or fewer lines)
			// can't push content past the column bottom, so it's always safe on the overflow
			// side. When it GROWS, the content below the paragraph in this column shifts down
			// by delta and must still clear the column bottom: slack = column bottom - the
			// lowest content currently below the paragraph. (Measuring against the whole
			// column's last line was wrong -- on a full page that's ~0 even for a delta-0
			// edit near the top.)
			// slack = room below the paragraph before the column overflows. colBottom is the
			// shipped box bottom (~ the footer line). lastBelow is the lowest baseline that is
			// part of the CONTIGUOUS text flow under the paragraph -- walk down line by line and
			// stop at the big gap before an isolated footer/page-number, which sits in the bottom
			// margin and isn't content the paragraph could push off the page.
			const colBottom = colBottomOf(cal.pageNo);
			const floorA = contentFloor(cal.pageNo);
			const belowBases = [
				...new Set(
					pageRecords(cal.pageNo)
						.filter((x) => x.t === 'g' && x.x >= cal.colL && x.x <= cal.colR && x.y > cal.bk + 0.5 && x.y <= floorA)
						.map((x) => +x.y.toFixed(1))
				)
			].sort((a, b) => a - b);
			let lastBelow = cal.bk;
			for (const y of belowBases) {
				if (y - lastBelow > cal.medGap * 2.5) break; // jumped to the footer/header
				lastBelow = y;
			}
			const slack = colBottom - (lastBelow + dk);
			// C3: does the column/page break move? If so we can't PROVE the patch exact -- but the
			// paragraph itself is right, only the reflow below is approximate. So render it as a
			// close-enough placeholder now (tinted) and reconcile the true break with a full
			// compile, instead of freezing on "recompiling" with no visual update.
			const overflow = delta > 0 && delta > slack + 1;
			const underflow = delta < -0.7 * cal.medGap;
			// Overflow with a next page renders TRUTHFULLY: whatever the shift pushes past the
			// column bottom (the paragraph's own tail and/or the column's last rows) moves to
			// the top of the next page's first column, pushing that page's content down --
			// instead of cramming rows past the bottom under the tint. Always provisional.
			if (overflow && cal.pageNo < pages.length) {
				const done = await overflowToNextPage(cal, r.records as any[], lineRecs as any[], {
					h1,
					dk,
					delta,
					colBottom,
					belowBases,
					lastBelow
				});
				if (done) {
					if (!req.transient) scheduleReconcile(req.onRecompile, 'overflow');
					return;
				}
			}
			// Footnote body text lives at the page bottom, outside the patch band: any
			// footnote-bearing paragraph reconciles. (A char-code signature comparison used to
			// license EXACT body patches -- deleted: it was blind to font/position changes, and
			// whether the page-bottom note block still matches is the engine's call.)
			const footnote = /\\footnote/.test(req.text) || /\\footnote/.test(req.orig);
			const fontGap = await missingInk(r.records as any[]);
			// an approx locate is placement-correct but break-inexact: always provisional. A
			// float-inner patch (tabular inside a \begin{table}) is provisional too: the cell
			// content is exact but auto column widths / float placement are the full pass's call.
			const provisionalStage = overflow
				? 'overflow'
				: underflow
					? 'underflow'
					: cal.approx
						? 'approx-locate'
						: req.floatInner
							? 'float-inner'
							: footnote
								? 'footnote'
								: fontGap
									? 'font-missing'
									: req.cmdChanged
										? 'command-changed'
										: null;
			// records anchor by glyph row (first daemon row baseline lands on b1); the wipe keeps
			// the line-shape extent too -- for a tabular that over-wipes into float glue, which
			// beats leaving the old table's ink outside a row-based band
			const top = cal.b1 - y0;
			const dropTop = cal.b1 - Math.max(h1, y0) - 2,
				dropBottom = cal.bk + dk + 2;
			const patchObj: Patch = {
				top,
				dropTop,
				dropBottom,
				delta,
				paraLeft: cal.paraLeft,
				colL: cal.colL,
				colR: cal.colR,
				newRecs: r.records as any[],
				flowBottom: floorA
			};
			activePatch.set(cal.pageNo, patchObj); // survive zoom re-renders until the next compile
			await renderPage(cal.pageNo, patchObj);
			patchedPages.add(cal.pageNo);
			showEditBand({ page: cal.pageNo, top, bottom: cal.bk + dk + Math.max(0, delta), colL: cal.colL, colR: cal.colR });
			followEdit(cal.pageNo, cal.b1, cal.bk + dk, cal.colL, cal.colR); // zoom+center on the edit (Typst-style)
			const ms = performance.now() - t0;
			if (provisionalStage) {
				provisionalPages = new Set(provisionalPages).add(cal.pageNo); // tint until the recompile lands
				ev('provisional', { stage: provisionalStage, page: cal.pageNo, delta: +delta.toFixed(1), transient: !!req.transient });
				status = `Refining p${cal.pageNo}…`;
				// debounced reconcile: the provisional render carries the typing; ONE full pass
				// runs after the user pauses instead of one per keystroke. Transient (repaired
				// mid-typing) edits never schedule one -- the balanced keystroke that follows will.
				if (!req.transient) scheduleReconcile(req.onRecompile, provisionalStage);
			} else {
				if (provisionalPages.has(cal.pageNo)) {
					const s = new Set(provisionalPages);
					s.delete(cal.pageNo);
					provisionalPages = s;
				}
				ev('patched', { page: cal.pageNo, delta: +delta.toFixed(1), ms: +ms.toFixed(0) });
				status = `Warm engine · patched p${cal.pageNo} in ${ms.toFixed(0)} ms`;
			}
		} catch (e) {
			ev('error', String(e));
			// instant path is best-effort; the debounced full recompile always follows
		} finally {
			patching = false;
			if (queuedPatch) {
				const q = queuedPatch;
				queuedPatch = null;
				instantPatch(q);
			}
		}
	}

	// (The JS-placed provisional insert -- anchor flow walk, follower ceiling, medGap seam
	// arithmetic -- is deleted. Inserted/deleted paragraphs render ONLY via the merged
	// patch: dispatch typesets them riding the previous block as one engine unit, so the
	// engine supplies indent and spacing. What that path can't carry takes the full pass.)
	// digit-tolerant row equality, used ONLY by the patch VERIFIER's grading (pinned
	// counters render fixed digits; CM digits share a width)
	const eqSeqDigits = (a: number[], b: number[]) =>
		a.length === b.length && a.every((v, i) => v === b[i] || (v >= 0x30 && v <= 0x39 && b[i] >= 0x30 && b[i] <= 0x39));

	// The truthful overflow split: page A keeps the band replace + shift with everything
	// past the column bottom CLIPPED; those rows re-draw at the top of page B's first
	// column as insert segments (para tail at the column text left, moved page rows at
	// their own absolute x), pushing page B's content down. First-order break estimate ->
	// caller always marks provisional and reconciles.
	async function overflowToNextPage(
		cal: Cal,
		recs: any[],
		lineRecs: any[],
		g: { h1: number; dk: number; delta: number; colBottom: number; belowBases: number[]; lastBelow: number }
	): Promise<boolean> {
		const pB = cal.pageNo + 1;
		const { h1, dk, delta, colBottom } = g;
		const topA = cal.b1 - h1;
		// para lines whose patched position crosses the column bottom
		let kA = lineRecs.length;
		while (kA > 1 && topA + lineRecs[kA - 1].y + (lineRecs[kA - 1].d ?? 2) > colBottom + 1) kA--;
		const cutY = kA < lineRecs.length ? (lineRecs[kA - 1].y + lineRecs[kA].y) / 2 : Infinity;
		const recsA = recs.filter((x) => x.t === 'font' || (x.y ?? 0) < cutY);
		const tailRecs = kA < lineRecs.length ? recs.filter((x) => x.t === 'font' || (x.y ?? 0) >= cutY) : [];
		// existing content-flow rows the shift pushes past the bottom (belowBases already
		// excludes the bottom-anchored footer via the content floor)
		const floorA = contentFloor(cal.pageNo);
		const movedFrom = g.belowBases.filter((y) => y + delta + dk > colBottom + 1);
		const movedMinY = movedFrom.length ? Math.min(...movedFrom) : Infinity;
		const pageA = pageRecords(cal.pageNo);
		const movedRecs = movedFrom.length
			? pageA.filter(
					(x: any) =>
						x.t === 'font' ||
						((x.t === 'g' || x.t === 'rule' || x.t === 'image' || x.t === 'lit') &&
							x.x >= cal.colL &&
							x.x <= cal.colR &&
							(x.y ?? 0) >= movedMinY - 0.5 &&
							(x.y ?? 0) <= floorA)
				)
			: [];
		if (!tailRecs.length && !movedRecs.length) return false;
		// page B's first column: body top under any isolated running-header row
		const gB = pageRecords(pB).filter((x: any) => x.t === 'g');
		const colsB = gB.length ? colCandidates(gB, cal.W, 8) : [];
		const colLB = colsB.length ? colsB[0] - 8 : cal.colL;
		const colRB = colsB.length ? colsB[0] + cal.W + 8 : cal.colR;
		let rowsB = gB.length
			? rowsOfG(
					gB.filter((x: any) => x.x >= colLB && x.x <= colRB),
					cal.medGap
				)
			: [];
		while (rowsB.length >= 2 && rowsB[1].y - rowsB[0].y > cal.medGap * 2.2) rowsB = rowsB.slice(1);
		const topB = rowsB.length ? rowsB[0].y : h1 + cal.medGap;
		const tailH = tailRecs.length ? lineRecs[lineRecs.length - 1].y + dk - (lineRecs[kA].y - h1) : 0;
		const movedH = movedRecs.length ? Math.max(...movedFrom) + dk - (movedMinY - h1) : 0;
		const push = (tailH ? tailH + cal.medGap : 0) + (movedH ? movedH + cal.medGap : 0);
		const segA: Patch = {
			top: topA,
			dropTop: topA - 2,
			dropBottom: cal.bk + dk + 2,
			delta,
			paraLeft: cal.paraLeft,
			colL: cal.colL,
			colR: cal.colR,
			newRecs: recsA,
			// EXACTLY the negation of the moved-rows predicate (y + delta + dk > colBottom + 1),
			// or the boundary row draws on both pages
			clipBottom: colBottom + 1 - dk,
			flowBottom: floorA
		};
		const segsB: Patch[] = [];
		let curTop = topB;
		if (tailRecs.length) {
			segsB.push({
				top: curTop - lineRecs[kA].y,
				dropTop: topB - h1 - 2,
				dropBottom: topB - h1 - 2,
				delta: push,
				paraLeft: colLB + 8,
				colL: colLB,
				colR: colRB,
				newRecs: tailRecs
			});
			curTop += tailH + cal.medGap;
		}
		if (movedRecs.length)
			segsB.push({
				top: curTop + h1 - movedMinY,
				dropTop: topB - h1 - 2,
				dropBottom: topB - h1 - 2,
				delta: segsB.length ? 0 : push,
				paraLeft: 0,
				colL: colLB,
				colR: colRB,
				newRecs: movedRecs
			});
		activePatch.set(cal.pageNo, segA);
		activePatch.set(pB, segsB.length === 1 ? segsB[0] : segsB);
		await renderPage(cal.pageNo, segA);
		await renderPage(pB, segsB.length === 1 ? segsB[0] : segsB);
		patchedPages.add(cal.pageNo);
		patchedPages.add(pB);
		provisionalPages = new Set(provisionalPages).add(cal.pageNo).add(pB);
		showEditBand({ page: cal.pageNo, top: topA, bottom: cal.bk + dk, colL: cal.colL, colR: cal.colR });
		followEdit(cal.pageNo, cal.b1, cal.bk + dk, cal.colL, cal.colR);
		status = `Refining p${cal.pageNo}…`;
		ev('provisional-split', { page: cal.pageNo, spillPage: pB, kA, of: lineRecs.length, moved: movedFrom.length, stage: 'overflow' });
		return true;
	}

	// Warm the per-paragraph daemon in the background: it loads the document preamble once
	// (heavy ones -- tikz/mhchem/etc. -- take ~1.5s), keyed by preamble hash, so the user's
	// first edit hits a ready daemon (~2ms) instead of paying the load. Fire-and-forget.
	let warmed = false;
	function warmDaemon() {
		if (warmed) return;
		warmed = true;
		const n = native();
		if (!n) return;
		const t = performance.now();
		// hsize 0 = the daemon falls back to its OWN engine-announced \columnwidth
		n.draftTypeset({ root, mainFile, text: 'warm', hsize: paper.colW })
			.then((r) => {
				ev('daemon-warm', { ms: +(performance.now() - t).toFixed(0), ok: r.ok });
				// only announce readiness if nothing else took over the status meanwhile
				if (r.ok && !compiling && !patching) status = 'Warm engine ready';
			})
			.catch(() => {
				warmed = false;
			});
	}

	// The engine grading its own guesses: when a compile lands, every still-active patch's
	// painted rows are content-matched (digit-tolerant) against the FRESH records and the
	// vertical drift measured. `patch-verify ok:false` = the instant preview showed
	// something the recompile had to fix -- the metric the replay harness minimizes.
	function verifyPatches() {
		for (const [n, patch] of activePatch) {
			const plist = Array.isArray(patch) ? patch : [patch];
			const fresh = rowsOfG(
				pageRecords(n).filter((x: any) => x.t === 'g'),
				12
			);
			for (const p of plist) {
				const pred = rowsOfG(
					p.newRecs.filter((x: any) => x.t === 'g').map((x: any) => ({ ...x, x: x.x + p.paraLeft, y: x.y + p.top })),
					12
				);
				if (!pred.length) continue;
				let found = 0;
				let drift = 0;
				let xdrift = 0;
				for (const row of pred) {
					let best: { dy: number; dx: number } | null = null;
					for (const fr of fresh)
						if (eqSeqDigits(fr.cs, row.cs)) {
							const dy = Math.abs(fr.y - row.y);
							if (best === null || dy < best.dy) best = { dy, dx: Math.abs(fr.left - row.left) };
						}
					if (best !== null) {
						found++;
						drift = Math.max(drift, best.dy);
						xdrift = Math.max(xdrift, best.dx);
					}
				}
				// signed first-row delta separates "painted too high" from "too low"
				let dy0: number | null = null;
				for (const fr of fresh)
					if (eqSeqDigits(fr.cs, pred[0].cs)) {
						const dy = fr.y - pred[0].y;
						if (dy0 === null || Math.abs(dy) < Math.abs(dy0)) dy0 = dy;
					}
				// verdicts: 'wrong' = found content painted at the wrong place (the real bug
				// signal; x counts -- a missed \parindent is a placement error too); 'stale' =
				// the compile contained newer text than the patch (normal mid-typing grading
				// noise); 'unknown' = nothing matched (usually a fully superseded patch, but
				// worth eyeballing via `near`)
				const verdict = drift > 3 || xdrift > 3 ? 'wrong' : found === pred.length ? 'ok' : found > 0 ? 'stale' : 'unknown';
				const near =
					verdict === 'ok'
						? undefined
						: fresh
								.filter((fr) => Math.abs(fr.y - pred[0].y) < 45)
								.map(
									(fr) =>
										`${fr.y.toFixed(1)}:${fr.cs
											.slice(0, 7)
											.map((c: number) => String.fromCodePoint(c))
											.join('')}`
								);
				ev('patch-verify', {
					page: n,
					rows: pred.length,
					found,
					drift: +drift.toFixed(1),
					xdrift: +xdrift.toFixed(1),
					dy0: dy0 === null ? null : +dy0.toFixed(1),
					verdict,
					ok: verdict === 'ok',
					near
				});
			}
		}
	}

	let compileToken = 0;
	async function compile(reason = 'trigger') {
		const n = native();
		if (!n || !root || !mainFile) return;
		// cancel-on-supersede: don't queue behind an in-flight compile -- fire a fresh one. The
		// service kills the older run's lualatex, so a hung/slow compile never blocks the latest
		// edit (else the 120s pass timeout would freeze the preview). This run drops its own
		// result if a still-newer compile started before it returned (token guard).
		const myToken = ++compileToken;
		ev('compile-start', { reason });
		compiling = true;
		// a recompile after an abandon already shows "Left warm engine (...), recompiling…"
		// keep the "Recompiling (…)…" / "Refining…" status the caller set for an abandon or a
		// provisional reconcile; only a fresh compile announces "Compiling project…"
		if (!reason.startsWith('abandon:') && !reason.startsWith('provisional:')) status = 'Compiling project…';
		error = null;
		try {
			const r = await n.draftCompile({ root, mainFile });
			if (myToken !== compileToken) {
				ev('compile-superseded', { reason });
				return;
			} // a newer compile owns the state now
			if (r.ok) {
				if (r.paperW > 0) {
					paper = { w: r.paperW, h: r.paperH, colW: r.colW, fs: r.footSkip || 0, mx: r.marginX, my: r.marginY };
					if (fitMode) fitToWidth(); // size to the pane now that the paper dims are known
				}
				pages = r.pages;
				parsedPages.clear();
				calCache.clear(); // geometry changed; paragraphs re-locate on next patch
				invalidatePixels(); // tier-2 crops come from THIS compile's PDF
				// pages we patched must repaint even if their records didn't change
				for (const pn of patchedPages) prevRecords.delete(pn);
				patchedPages.clear();
				verifyPatches(); // grade every live patch against the engine's truth before dropping it
				activePatch.clear(); // fresh records already carry the edits
				editBand = null; // fresh layout may have shifted the band; don't highlight a stale spot
				await tick(); // let the {#each} create/resize canvases
				applyCssSizes(); // every page needs its CSS box (scroll geometry), painted or not
				let changed = 0;
				for (const p of pages) {
					if (!inWindow(p.n)) continue; // off-window pages paint on scroll-in
					if (prevRecords.get(p.n) !== p.records) {
						const cv = canvasEls[p.n - 1];
						if (cv && cv.width > 0) {
							// ONE visual swap per reconcile: hold the page's last frame (the
							// provisional patch, already ~the truth) and repaint once when the
							// fresh PDF raster lands -- painting records first and the raster
							// ~300ms later double-swapped the page at every typing pause
							requestBaseAuto(p.n);
						} else {
							await renderPage(p.n);
						}
						prevRecords.set(p.n, p.records);
						changed++;
					}
				}
				updateWindow();
				// drop stale hashes for removed pages
				for (const k of [...prevRecords.keys()]) if (k > pages.length) prevRecords.delete(k);
				const secs = (r.ms / 1000).toFixed(1);
				status = `Compiled in ${secs} s · ${pages.length} page${pages.length === 1 ? '' : 's'}${(r.passes ?? 1) > 1 ? ` · ${r.passes} passes` : ''}`;
				ev('compiled', { pages: pages.length, passes: r.passes ?? 1, changed, ms: r.ms });
				warmDaemon(); // preload the daemon (heavy preambles cost ~1.5s once) so the first edit patches instantly
				if (pendingFocus) {
					// jump to the structurally-edited paragraph in the fresh layout: its text is on
					// the page now, so the content-based locate can find it. Best effort.
					const f = pendingFocus;
					pendingFocus = null;
					locate(f.file, f.line, f.text, f.listItem, f.endLine)
						.then((fc) => {
							if ('bail' in fc) return;
							showEditBand({
								page: fc.pageNo,
								top: fc.b1 - fc.medGap * 0.8,
								bottom: fc.bk + fc.medGap * 0.3,
								colL: fc.colL,
								colR: fc.colR
							});
							followEdit(fc.pageNo, fc.b1, fc.bk, fc.colL, fc.colR);
						})
						.catch(() => {
							/* focus is cosmetic; never block the render on it */
						});
				}
			} else if (!(r as { superseded?: boolean }).superseded) {
				// svelte-check doesn't reliably narrow this cross-module discriminated union.
				// A service-side 'superseded' isn't an error -- the newer compile will render.
				const fail = r as { error: string; log?: string };
				error = fail.error + (fail.log ? '\n' + fail.log : '');
				status = '';
			}
		} catch (e) {
			if (myToken !== compileToken) return;
			error = e instanceof Error ? e.message : String(e);
			status = '';
		}
		// a newer compile may have started during the async render above; if so, leave the state
		// (compiling flag, queued patch) to it so we don't clear its in-flight status early
		if (myToken !== compileToken) return;
		compiling = false;
		if (provisionalPages.size) provisionalPages = new Set(); // reconcile finished: drop the tint
		if (queuedPatch) {
			// an edit arrived mid-compile; apply it against the fresh geometry
			const q = queuedPatch;
			queuedPatch = null;
			instantPatch(q);
		}
		// inserts/structural edits typed mid-compile could only bail; have the editor
		// re-evaluate the buffer against the fresh baseline now instead of waiting for the
		// next keystroke (the "typed during a reconcile, nothing showed" hole)
		onSettled?.();
	}

	// recompile whenever `trigger` changes (and once on mount). untrack the compile call:
	// compile() reads and writes $state (compiling/pages/status), so without untrack this
	// effect would take those as dependencies and re-run itself into an infinite loop.
	$effect(() => {
		const t = trigger;
		untrack(() => compile('trigger:' + t));
	});

	// ---- zoom / fit ----
	const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
	function fitToWidth() {
		if (!containerW || !paper.w) return;
		zoom = clampZoom((containerW - PAGE_PAD * 2) / (paper.w * PT2PX));
	}
	function setZoom(z: number) {
		fitMode = false;
		zoom = clampZoom(z);
	}
	const zoomIn = () => setZoom(zoom * 1.2);
	const zoomOut = () => setZoom(zoom / 1.2);
	const actualSize = () => setZoom(1);
	function fitWidthBtn() {
		fitMode = true;
		fitToWidth();
	}

	// Zoom re-renders the canvases at the new resolution so text stays crisp, but that's
	// O(pages) work; during a rapid gesture we resize the canvas CSS box immediately (the
	// browser scales the existing bitmap -- instant, a touch soft) and re-render once the
	// gesture settles.
	let rerenderTimer: ReturnType<typeof setTimeout> | null = null;
	function applyCssSizes() {
		const S = dispScale;
		for (let i = 0; i < pages.length; i++) {
			const cv = canvasEls[i];
			if (!cv) continue;
			cv.style.width = paper.w * S + 'px';
			cv.style.height = paper.h * S + 'px';
		}
	}
	async function rerenderAll() {
		for (const p of pages) if (inWindow(p.n) || activePatch.has(p.n)) await renderPage(p.n);
	}
	// react to zoom changes (from buttons, wheel, or a fit-to-width): instant CSS resize +
	// debounced crisp re-render
	$effect(() => {
		void zoom;
		if (!pages.length) return;
		untrack(() => {
			applyCssSizes();
			if (rerenderTimer) clearTimeout(rerenderTimer);
			rerenderTimer = setTimeout(() => {
				rerenderTimer = null;
				rerenderAll();
			}, 140);
		});
	});
	// re-fit when the pane resizes, until the user takes manual control
	$effect(() => {
		void containerW;
		if (fitMode) untrack(() => fitToWidth());
	});

	// ctrl/cmd + wheel zooms; a plain wheel scrolls. The listener must be non-passive for
	// preventDefault to take, so attach it by hand once the scroller is bound.
	$effect(() => {
		const el = scroller;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (!(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			untrack(() => setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});
	// canvases sit inside position:relative wrappers (the tint/highlight overlays), so their
	// offsetTop/Left are relative to the WRAPPER (always ~0), not the scroller. Compute the page
	// origin within the scroller via bounding rects instead -- offsetTop here silently broke
	// followEdit, goToPage, and the page indicator when the wrappers became positioned.
	function pageOrigin(cv: HTMLElement): { top: number; left: number } {
		const s = scroller!;
		const cr = cv.getBoundingClientRect();
		const sr = s.getBoundingClientRect();
		return { top: cr.top - sr.top + s.scrollTop, left: cr.left - sr.left + s.scrollLeft };
	}
	function onScroll() {
		if (!scroller || !pages.length) return;
		// the page whose top is nearest the viewport top (a hair below it)
		const mid = scroller.scrollTop + 40;
		let best = 1,
			bestD = Infinity;
		for (let i = 0; i < canvasEls.length; i++) {
			const cv = canvasEls[i];
			if (!cv) continue;
			const d = Math.abs(pageOrigin(cv).top - mid);
			if (d < bestD) {
				bestD = d;
				best = i + 1;
			}
		}
		curPage = best;
		scheduleWindow();
	}
	function goToPage(n: number) {
		const clamped = Math.min(pages.length, Math.max(1, n));
		paintAround(clamped);
		const cv = canvasEls[clamped - 1];
		if (cv && scroller) scroller.scrollTo({ top: pageOrigin(cv).top - 12, behavior: 'smooth' });
	}

	// Typst-style follow: on each patch, pan the preview so the edited paragraph sits near the
	// vertical center (and horizontally on its column), with a tiny one-time zoom-in toward a
	// stable resting level just above fit-width. The zoom only ever increases and settles there,
	// so repeated edits neither runaway-zoom nor pull back a view the user zoomed in further; if
	// they're already zoomed past it, we just pan. Bounds are record-space: a point (x, y) draws
	// at canvas (paper.mx + x, paper.my + y) * dispScale.
	let followEdits = $state(true);
	const FOLLOW_ZOOM = 1.08; // a tiny magnification above fit-width, the follow resting level
	function followEdit(pageNo: number, bandTop: number, bandBottom: number, colL?: number, colR?: number) {
		if (!followEdits || !scroller) return;
		paintAround(pageNo);
		let zoomed = false;
		if (containerW && paper.w) {
			const target = clampZoom(((containerW - PAGE_PAD * 2) / (paper.w * PT2PX)) * FOLLOW_ZOOM);
			if (target > zoom + 1e-3) {
				setZoom(target);
				zoomed = true;
			}
		}
		const center = () => {
			const cv = canvasEls[pageNo - 1];
			if (!cv || !scroller) return;
			const S = dispScale;
			const org = pageOrigin(cv);
			const midY = org.top + (paper.my + (bandTop + bandBottom) / 2) * S;
			const toTop = Math.max(0, midY - scroller.clientHeight / 2);
			let toLeft = scroller.scrollLeft;
			if (colL != null && colR != null) {
				const midX = org.left + (paper.mx + (colL + colR) / 2) * S;
				toLeft = Math.max(0, Math.min(midX - scroller.clientWidth / 2, scroller.scrollWidth - scroller.clientWidth));
			}
			// skip a redundant scroll when the edit is already centered, so continuous typing in one
			// paragraph doesn't re-issue a smooth scroll every keystroke
			if (Math.abs(toTop - scroller.scrollTop) > 4 || Math.abs(toLeft - scroller.scrollLeft) > 4)
				scroller.scrollTo({ top: toTop, left: toLeft, behavior: 'smooth' });
		};
		if (zoomed)
			tick().then(center); // wait for the zoom's css resize + reflow so offsets are current
		else center();
	}

	// ---- SyncTeX in the live preview ----
	// The word under a click, rebuilt from the page's glyph records (same baseline row,
	// expanded to the nearest space-gaps). It anchors the source jump against line drift,
	// exactly like the PDF viewer's double-clicked word. Type1 slots map to text through
	// the parsed font's AGL table; anything unmappable just ends the word.
	function wordAt(n: number, xPt: number, yPt: number): string | undefined {
		const records = pageRecords(n);
		const uniOf: Record<number, { uni?: number[]; size: number }> = {};
		for (const r of records)
			if (r.t === 'font') uniOf[r.id] = { uni: r.t1 ? fontByFile.get(t1Key(r))?.t1?.textMap : undefined, size: r.size || 10 };
		// glyphs whose baseline sits just below the click (text spans roughly [y-0.8em, y+0.2em])
		const band = records.filter((r: any) => r.t === 'g' && r.y >= yPt - 2 && r.y <= yPt + 9);
		if (!band.length) return undefined;
		const base = band.reduce((b: any, g: any) => (Math.abs(g.y - yPt - 4) < Math.abs(b.y - yPt - 4) ? g : b)).y;
		const row = band.filter((g: any) => Math.abs(g.y - base) < 2).sort((a: any, b: any) => a.x - b.x);
		let i = row.findIndex((g: any) => xPt >= g.x && xPt <= g.x + (g.w || 0));
		if (i < 0) i = row.reduce((bi: number, g: any, gi: number) => (Math.abs(g.x - xPt) < Math.abs(row[bi].x - xPt) ? gi : bi), 0);
		const gapAfter = (k: number) => row[k + 1].x - (row[k].x + (row[k].w || 0));
		const isGap = (k: number) => gapAfter(k) > Math.max(0.9, 0.13 * (uniOf[row[k].f]?.size || 10));
		let lo = i,
			hi = i;
		while (lo > 0 && !isGap(lo - 1)) lo--;
		while (hi < row.length - 1 && !isGap(hi)) hi++;
		let word = '';
		for (let k = lo; k <= hi; k++) {
			const g = row[k];
			const u = uniOf[g.f]?.uni;
			const cp = u ? u[g.c] || 0 : g.c;
			if (cp < 32 || cp > 0xffff) return word.length >= 2 ? word : undefined; // ligature/PUA: keep what we have
			word += String.fromCodePoint(cp);
		}
		return word.length >= 2 ? word : undefined;
	}

	// click feedback: an instant ring pulse where the double-click landed, so the sync
	// action is visible even before synctex resolves. Page-absolute pt, like the click.
	let clickMark = $state<{ page: number; x: number; y: number } | null>(null);
	let clickMarkTimer: ReturnType<typeof setTimeout> | null = null;
	function showClickMark(page: number, x: number, y: number) {
		clickMark = { page, x, y };
		if (clickMarkTimer) clearTimeout(clickMarkTimer);
		clickMarkTimer = setTimeout(() => {
			clickMarkTimer = null;
			clickMark = null;
		}, 900);
	}

	// inverse: double-click a page -> source location via the reconcile PDF's synctex
	async function onCanvasDblClick(n: number, e: MouseEvent) {
		const nat = native();
		if (!nat || !onInverseSync) return;
		const xPt = e.offsetX / dispScale;
		const yPt = e.offsetY / dispScale;
		showClickMark(n, xPt, yPt);
		try {
			const res: any = await nat.synctex({ action: 'edit', pdf: root + '/_draft/draft.pdf', page: n, x: xPt / BP2PT, y: yPt / BP2PT });
			ev('inverse-sync', { page: n, x: +xPt.toFixed(1), y: +yPt.toFixed(1), input: res?.input, line: res?.line });
			if (res?.ok && res.input && res.line >= 1) onInverseSync(res.input, res.line, wordAt(n, xPt - paper.mx, yPt - paper.my));
		} catch {
			/* sync is best-effort */
		}
	}

	// Save the reconcile PDF (the exact document the canvases mirror). A pending reconcile
	// or in-flight compile means the PDF is behind the preview: flush/refresh it first so
	// the saved file never trails the last edit.
	let savingPdf = $state(false);
	async function savePdf() {
		const nat = native();
		if (!nat || savingPdf || !pages.length) return;
		savingPdf = true;
		try {
			if (reconcileTimer) {
				clearTimeout(reconcileTimer);
				reconcileTimer = null;
				const r = pendingReconcile;
				pendingReconcile = null;
				await r?.();
				await compile('save-pdf');
			} else if (compiling) {
				await compile('save-pdf'); // supersedes the in-flight run; this one owns the result
			}
			const name =
				mainFile
					.split('/')
					.pop()!
					.replace(/\.tex$/i, '') + '.pdf';
			const res = await nat.draftSavePdf({ root, defaultName: name });
			ev('save-pdf', { saved: res.saved, path: res.path });
			if (res.saved && res.path) status = `PDF saved to ${res.path}`;
		} catch (e) {
			status = `Could not save PDF: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			savingPdf = false;
		}
	}

	// forward: scroll + flash the box synctex reported for a source line (all args bp, v = baseline)
	export function syncTo(pageNo: number, hBp: number, vBp: number, wBp: number, hgtBp: number) {
		if (pageNo < 1 || pageNo > pages.length) return;
		const colL = hBp * BP2PT - paper.mx;
		const bottom = vBp * BP2PT - paper.my;
		const top = bottom - Math.max(6, hgtBp * BP2PT);
		const colR = colL + Math.max(20, wBp * BP2PT);
		ev('forward-sync', { page: pageNo, top: +top.toFixed(1), bottom: +bottom.toFixed(1) });
		showEditBand({ page: pageNo, top, bottom, colL, colR });
		const keep = followEdits;
		followEdits = true; // an explicit sync always navigates, even with follow-edits off
		followEdit(pageNo, top, bottom, colL, colR);
		followEdits = keep;
	}
</script>

<div class="bg-surface-200-800 flex h-full w-full flex-col">
	<!-- one toolbar row: status on the left, zoom + page-nav on the right ("Draft preview"
	     already labels the pane header above) -->
	<div class="border-surface-300-700 text-surface-600-300 flex shrink-0 items-center gap-1 border-b px-2 py-1 text-xs">
		{#if error}<span class="text-error-500 shrink-0">preview error</span>{:else}<span class="text-surface-700-200 truncate">{status}</span
			>{/if}
		<div class="flex-1"></div>
		<button
			class="hover:preset-tonal rounded p-1 disabled:opacity-40"
			onclick={savePdf}
			disabled={!pages.length || savingPdf}
			title="Save PDF"
			aria-label="Save PDF"
		>
			<Download class="size-4" />
		</button>
		<span class="bg-surface-300-700 mx-1 h-4 w-px shrink-0"></span>
		<button
			class="hover:preset-tonal rounded p-1 disabled:opacity-40"
			onclick={zoomOut}
			disabled={!pages.length}
			title="Zoom out"
			aria-label="Zoom out"
		>
			<ZoomOut class="size-4" />
		</button>
		<button
			class="hover:preset-tonal min-w-11 rounded px-1 py-1 text-center tabular-nums"
			onclick={actualSize}
			disabled={!pages.length}
			title="Actual size (100%)"
		>
			{Math.round(zoom * 100)}%
		</button>
		<button
			class="hover:preset-tonal rounded p-1 disabled:opacity-40"
			onclick={zoomIn}
			disabled={!pages.length}
			title="Zoom in"
			aria-label="Zoom in"
		>
			<ZoomIn class="size-4" />
		</button>
		<button
			class="hover:preset-tonal rounded p-1 disabled:opacity-40"
			class:preset-tonal={fitMode}
			onclick={fitWidthBtn}
			disabled={!pages.length}
			title="Fit width"
			aria-label="Fit width"
		>
			<MoveHorizontal class="size-4" />
		</button>
		<button
			class="hover:preset-tonal rounded p-1 disabled:opacity-40"
			class:preset-tonal={followEdits}
			class:text-primary-500={followEdits}
			onclick={() => (followEdits = !followEdits)}
			disabled={!pages.length}
			title={followEdits ? 'Following your edits (click to stop)' : 'Follow your edits in the preview'}
			aria-label="Follow edits"
			aria-pressed={followEdits}
		>
			<Crosshair class="size-4" />
		</button>
		{#if pages.length}
			<span class="bg-surface-300-700 mx-1 h-4 w-px shrink-0"></span>
			<button
				class="hover:preset-tonal rounded p-1 disabled:opacity-40"
				onclick={() => goToPage(curPage - 1)}
				disabled={curPage <= 1}
				title="Previous page"
				aria-label="Previous page"
			>
				<ChevronUp class="size-4" />
			</button>
			<span class="shrink-0 tabular-nums">{curPage} / {pages.length}</span>
			<button
				class="hover:preset-tonal rounded p-1 disabled:opacity-40"
				onclick={() => goToPage(curPage + 1)}
				disabled={curPage >= pages.length}
				title="Next page"
				aria-label="Next page"
			>
				<ChevronDown class="size-4" />
			</button>
		{/if}
	</div>
	{#if error}
		<pre class="text-error-500 m-3 overflow-auto rounded bg-surface-50-950 p-3 text-xs whitespace-pre-wrap">{error}</pre>
	{/if}
	<div
		bind:this={scroller}
		bind:clientWidth={containerW}
		onscroll={onScroll}
		class="flex flex-1 flex-col items-center gap-4 overflow-auto p-4"
	>
		{#each pages as p (p.n)}
			<div class="relative shadow-lg">
				<canvas bind:this={canvasEls[p.n - 1]} ondblclick={(e) => onCanvasDblClick(p.n, e)}></canvas>
				{#if provisionalPages.has(p.n)}
					<!-- close-enough placeholder: STATIC subtle tint while the full compile reconciles
				     this page (a pulsing overlay reads as flicker during continuous typing) -->
					<div class="pointer-events-none absolute inset-0 bg-primary-500/10" transition:fade={{ duration: 150 }}></div>
				{/if}
				{#if editBand && editBand.page === p.n}
					<!-- the located band of the paragraph being edited; fades shortly after typing stops -->
					<div
						class="pointer-events-none absolute rounded-sm bg-yellow-300/30"
						transition:fade={{ duration: 300 }}
						style="left:{(paper.mx + editBand.colL) * dispScale}px; top:{(paper.my + editBand.top - 2) *
							dispScale}px; width:{(editBand.colR - editBand.colL) * dispScale}px; height:{(editBand.bottom - editBand.top + 4) *
							dispScale}px"
					></div>
				{/if}
				{#if clickMark && clickMark.page === p.n}
					<!-- where the sync double-click landed -->
					<div
						class="pointer-events-none absolute"
						transition:fade={{ duration: 200 }}
						style="left:{clickMark.x * dispScale}px; top:{clickMark.y * dispScale}px"
					>
						<span class="border-primary-500 absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2"></span>
						<span class="bg-primary-500 absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"></span>
					</div>
				{/if}
			</div>
			<div class="text-surface-500 -mt-3 text-[10px]">page {p.n}</div>
		{/each}
	</div>
</div>
