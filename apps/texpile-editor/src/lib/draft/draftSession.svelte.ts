/* eslint-disable @typescript-eslint/no-explicit-any */
// One live draft-preview session: owns the compiled document state (pages, paper, page
// records, live patches) and composes the fonts/bitmaps/viewport/patcher/compiler pieces.
// Everything painted came from the real engine; see DraftView.svelte for the view shell.
import { tick } from 'svelte';
import { parseRecords, pageIsRtl } from './pageRecords';
import { locateParagraph } from './locate/locateParagraph';
import type { LocateContext, PaperMetrics } from './locate/locate.types';
import { verifyPatches } from './patch/verifyPatches';
import type { Patch, PatchReq } from './patch/patch.types';
import type { SeamEntry } from './patch/seam.types';
import { DraftFonts } from './draftFonts';
import { DraftBitmaps } from './draftBitmaps';
import { paintRecords, splitPatchRecords, type PaintDeps } from './draftPaint';
import { flowDyAt } from './patch/glueShift';
import { packsToGoal } from './heuristics/packsToGoal';
import { DraftViewport } from './draftViewport.svelte';
import { DraftPatcher } from './draftPatcher.svelte';
import { DraftCompiler } from './draftCompiler.svelte';
import { resetEngineTruth, updateEngineTruth } from './engineTruth';
import { wordAt } from './draftWordAt';
import { BP2PT } from './texUnits';
import { nativeBridge } from '$lib/workspace/fileSystem';
import type { DraftPage } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';

type SessionOpts = {
	root: () => string;
	mainFile: () => string;
	onInverseSync: () => ((file: string, line: number, selectText?: string) => void) | undefined;
	onSettled: () => (() => void) | undefined;
	onDiagnostics: () => ((logPath: string) => void) | undefined;
};

export class DraftSession {
	pages = $state<DraftPage[]>([]);
	paper = $state<PaperMetrics>({
		w: 595,
		h: 842,
		colW: 0,
		textW: 0,
		fs: 0,
		mx: 72.27,
		my: 72.27,
		colSep: 0,
		blSkip: 0,
		parSkip: 0,
		topSkip: 0,
		srcFiles: []
	});
	canvasEls = $state<HTMLCanvasElement[]>([]);
	savingPdf = $state(false);

	readonly fonts = new DraftFonts();
	readonly bitmaps: DraftBitmaps;
	readonly vp: DraftViewport;
	readonly compiler: DraftCompiler;
	readonly patcher: DraftPatcher;

	private parsedPages = new Map<number, any[]>();
	private patchedPages = new Set<number>();
	// per-break pruned runs from the last compile (see page-extract.lua seam capture)
	private seams: SeamEntry[] = [];
	// a live patch stays on screen after the fast path applies it; keep it so a zoom
	// re-render (which redraws from the untouched page records) re-applies it instead of
	// reverting. Cleared on a full compile (fresh records already carry the edit).
	private activePatch = new Map<number, Patch | Patch[]>(); // arrays = split patches (column spans)
	private locateCtx: LocateContext;

	constructor(private opts: SessionOpts) {
		resetEngineTruth(); // a fresh session's document owns the truth; never inherit another's
		this.bitmaps = new DraftBitmaps({
			root: opts.root,
			paper: () => this.paper,
			dispScale: () => this.vp.dispScale,
			repaint: (n) => void this.renderPage(n, this.activePatch.get(n)),
			emit: (k, d) => this.ev(k, d)
		});
		this.vp = new DraftViewport({
			canvas: (n) => this.canvasEls[n - 1],
			pageCount: () => this.pages.length,
			recordsRaw: (n) => this.pages[n - 1]?.records ?? '',
			hasPatch: (n) => this.activePatch.has(n),
			paper: () => this.paper,
			renderPage: (n) => this.renderPage(n),
			emit: (k, d) => this.ev(k, d)
		});
		this.compiler = new DraftCompiler({
			root: opts.root,
			mainFile: opts.mainFile,
			paperColW: () => this.paper.colW,
			patchInFlight: () => this.patcher.inFlight,
			applyCompiled: (r) => this.applyCompiled(r),
			afterCompile: () => {
				this.patcher.afterCompile();
				// inserts/structural edits typed mid-compile could only bail; have the editor
				// re-evaluate the buffer against the fresh baseline now instead of waiting for the
				// next keystroke (the "typed during a reconcile, nothing showed" hole)
				this.opts.onSettled()?.();
				// The draft compile writes its OWN log; the normal pipeline polls the expected .log
				// of the user's compile command, which never runs in live mode -- so a document with
				// real LaTeX errors reported nothing while the engine still shipped pages.
				this.opts.onDiagnostics()?.(this.opts.root() + '/_draft/draft.log');
			},
			emit: (k, d) => this.ev(k, d)
		});
		this.patcher = new DraftPatcher({
			hasNative: () => !!nativeBridge(),
			pageCount: () => this.pages.length,
			compiling: () => this.compiler.compiling,
			setStatus: (s) => (this.compiler.status = s),
			compile: (reason) => void this.compiler.compile(reason),
			locate: (file, line, orig, listItem, endLine) => locateParagraph(this.locateCtx, file, line, orig, listItem, endLine),
			daemonTypeset: (body) => this.compiler.daemonTypeset(body),
			pageRecords: (n) => this.pageRecords(n),
			colBottomOf: (p) => this.colBottomOf(p),
			contentFloor: (p) => this.contentFloor(p),
			paper: () => this.paper,
			// a page is stretched when its glue records show effective != natural width --
			// the OUTER shipout box always packs exactly (gsn 0 on every class tested), the
			// stretching happens on the inner output box, and the vg records carry its result
			pageStretchy: (p) => this.pageRecords(p).some((r: any) => r.t === 'vg' && r.nw !== undefined && Math.abs(r.w - r.nw) > 0.05),
			missingInk: (records) => this.fonts.missingInk(records),
			applyPatch: async (n, p) => {
				this.activePatch.set(n, p);
				await this.renderPage(n, p);
				this.patchedPages.add(n);
			},
			clearPatch: async (n) => {
				// stays in patchedPages: the page painted patch ink and must repaint on landing
				if (this.activePatch.delete(n)) await this.renderPage(n);
			},
			showEditBand: (b, holdMs) => this.vp.showEditBand(b, holdMs),
			synctex: (b) => nativeBridge()!.synctex(b as any),
			pdfPath: () => this.opts.root() + '/_draft/draft.pdf',
			seams: () => this.seams,
			pageIsRtl: (p) => this.rtlPage(p),
			packsToGoal: (p) => packsToGoal(this.pageRecords(p)),
			splitSkeleton: (items, targetPt, capacity) => {
				const nb = nativeBridge();
				if (!nb?.draftSkeleton) return Promise.resolve({ ok: false as const, error: 'no-bridge' });
				return nb.draftSkeleton({ root: this.opts.root(), mainFile: this.opts.mainFile(), items, targetPt, capacity });
			},
			followEdit: (page, top, bottom, colL, colR) => this.vp.followEdit(page, top, bottom, colL, colR),
			emit: (k, d) => this.ev(k, d)
		});
		// reactive state crosses into the extracted locate/patch modules through accessors
		// only, so a captured context never goes stale when a compile replaces pages/paper
		this.locateCtx = {
			pdfPath: () => this.opts.root() + '/_draft/draft.pdf',
			paper: () => this.paper,
			pageNumbers: () => this.pages.map((p) => p.n),
			pageCount: () => this.pages.length,
			pageRecords: (n) => this.pageRecords(n),
			rtlPage: (n) => this.rtlPage(n),
			synctex: (b) => nativeBridge()!.synctex(b as any),
			typesetParagraph: ({ text, hsize }) => this.compiler.daemonTypeset({ text, hsize }),
			emit: (k, d) => this.ev(k, d)
		};
	}

	// test hook: structured decision log readable from Playwright via window.__draftEvents
	// (renderer console.log isn't reliably relayed through _electron). Capped so a long
	// session can't grow it without bound.
	ev(kind: string, detail?: unknown): void {
		const w = window as unknown as { __draftEvents?: unknown[] };
		const a = (w.__draftEvents ||= []);
		a.push({ kind, detail, t: performance.now() });
		if (a.length > 200) a.splice(0, a.length - 200);
	}

	pageRecords(n: number): any[] {
		if (!this.parsedPages.has(n)) {
			const { records, dropped } = parseRecords(this.pages[n - 1]?.records ?? '');
			if (dropped) this.ev('records-unparseable', { page: n, dropped });
			this.parsedPages.set(n, records);
		}
		return this.parsedPages.get(n)!;
	}
	// a right-to-left page's records are in logical order while the PDF is in visual order, so
	// nothing on it may be painted or spliced from records -- it waits for the exact-PDF raster
	rtlPage(n: number): boolean {
		return pageIsRtl(this.pages[n - 1]?.unc);
	}

	// The body's bottom in record space: the shipout box baseline (ht) IS the footer line's
	// baseline, \footskip above it is the last body line. Capacity checks measure against
	// this; everything below it (the footer) is bottom-anchored and no patch may shift,
	// clip, or move it.
	colBottomOf(p: number): number {
		const meta = this.pages[p - 1] as any;
		return meta?.ht ? meta.ht - this.paper.fs : meta?.h || 1e9;
	}
	contentFloor(p: number): number {
		return this.colBottomOf(p) + 2;
	}

	private paintDeps(): PaintDeps {
		return { fonts: this.fonts, bitmaps: this.bitmaps, paper: this.paper };
	}

	async renderPage(n: number, requestedPatch?: Patch | Patch[]): Promise<void> {
		const cv = this.canvasEls[n - 1];
		if (!cv) return;
		// windowed: plain repaints of off-screen pages wait for window entry; explicit patch
		// splices and pages carrying a live patch always paint (they are the user's focus)
		if (!requestedPatch && !this.activePatch.has(n) && !this.vp.inWindow(n)) return;
		// a plain re-render (e.g. after a zoom) must re-apply any live patch on this page
		const patch = requestedPatch ?? this.activePatch.get(n);
		const patches: Patch[] = !patch ? [] : Array.isArray(patch) ? patch : [patch];
		const records = this.pageRecords(n);
		await this.fonts.ensureFonts(records);
		for (const p of patches) await this.fonts.ensureFonts(p.newRecs);
		const S = this.vp.dispScale;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		cv.width = Math.round(this.paper.w * S * dpr);
		cv.height = Math.round(this.paper.h * S * dpr);
		cv.style.width = this.paper.w * S + 'px';
		cv.style.height = this.paper.h * S + 'px';
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, this.paper.w * S, this.paper.h * S);
		// exact-PDF base: paint the raster when it has landed for this compile+scale; the
		// records draw covers the page meanwhile (and permanently when the PDF is truncated).
		// the raster is the RESTING view only: pages carrying a live patch always draw from
		// records -- the proven splice renderer -- and snap to the base when the patch clears
		const bkey = this.bitmaps.baseKey(n, dpr);
		const base = this.bitmaps.base(bkey);
		const ready = !!base && base !== 'loading' && base !== 'failed';
		// an RTL page has no correct record rendering at all, so it takes the raster even under a
		// patch -- compositing patch ink onto it would put mirrored glyphs back on the page
		const rtl = this.rtlPage(n);
		if (ready && (!patches.length || rtl)) {
			ctx.drawImage(base as ImageBitmap, 0, 0, this.paper.w * S, this.paper.h * S);
			return;
		}
		if (!base) this.bitmaps.requestBase(n, bkey);
		// hold the white page until the raster lands rather than flash mirrored text. If the
		// raster can never land (a truncated PDF -- 'failed'), fall through: wrong-order ink still
		// carries the words, and a permanently blank page carries nothing.
		if (rtl && base !== 'failed') return;
		if (!patches.length) {
			paintRecords(ctx, records, S, 0, n, this.paintDeps());
			return;
		}
		const meta = this.pages[n - 1] as any;
		const contentBottom = (meta?.ht || meta?.h || Infinity) + 2;
		const { unchanged, shifted } = splitPatchRecords(records, patches, contentBottom);
		paintRecords(ctx, unchanged, S, 0, n, this.paintDeps());
		patches.forEach((p, i) => {
			// glue-distributed shift (stretched pages): per-record dy from the flow steps
			if (p.flowSteps?.length) {
				const flowed = shifted[i].map((r: any) => (r.y === undefined ? r : { ...r, y: r.y + flowDyAt(p.flowSteps, r.y, p.delta) }));
				paintRecords(ctx, flowed, S, 0, n, this.paintDeps());
			} else {
				paintRecords(ctx, shifted[i], S, p.delta, n, this.paintDeps());
			}
			paintRecords(
				ctx,
				p.newRecs.map((r) => (r.t === 'font' ? r : { ...r, x: (r.x ?? 0) + p.paraLeft, y: (r.y ?? 0) + p.top })),
				S,
				0,
				n,
				this.paintDeps()
			);
		});
	}

	private async applyCompiled(r: any): Promise<void> {
		if (r.paperW > 0) {
			this.paper = {
				w: r.paperW,
				h: r.paperH,
				colW: r.colW,
				textW: r.textW || 0,
				fs: r.footSkip || 0,
				mx: r.marginX,
				my: r.marginY,
				colSep: r.colSep || 0,
				blSkip: r.blSkip || 0,
				parSkip: r.parSkip || 0,
				topSkip: r.topSkip || 0,
				srcFiles: r.srcFiles ?? []
			};
			if (this.vp.fitMode) this.vp.fitToWidth(); // size to the pane now that the paper dims are known
		}
		this.seams = r.seams ?? [];
		// counter truth + the executed \begin{document} line: the decision layer pins to these
		updateEngineTruth({ counters: r.counters ?? [], bodyLine: r.bodyLine, mainRel: this.opts.mainFile() });
		this.pages = r.pages;
		// the walker checks its own glyph placement against the engine's line width and had
		// been discarding the answer. It is 0.0000 on every page of every fixture, so a
		// nonzero one means this page's records do not reproduce the engine and anything
		// spliced onto it is suspect. Surfaced rather than refused: no fixture exercises
		// font expansion, where a legitimate rounding difference could appear.
		const drift = (r.pages as { n: number; dev?: number }[]).filter((p) => (p.dev ?? 0) > 0);
		if (drift.length) this.ev('page-walk-drift', { pages: drift.map((p) => ({ n: p.n, dev: p.dev })) });
		this.parsedPages.clear();
		this.patcher.geometryChanged(); // geometry changed; paragraphs re-locate on next patch
		this.bitmaps.invalidate(); // tier-2 crops come from THIS compile's PDF
		// pages we patched must repaint even if their records didn't change
		for (const pn of this.patchedPages) this.vp.prevRecords.delete(pn);
		this.patchedPages.clear();
		// grade every live patch against the engine's truth before dropping it
		verifyPatches({ pageRecords: (n) => this.pageRecords(n), emit: (k, d) => this.ev(k, d) }, this.activePatch);
		this.activePatch.clear(); // fresh records already carry the edits
		this.vp.clearEditBand(); // fresh layout may have shifted the band; don't highlight a stale spot
		await tick(); // let the {#each} create/resize canvases
		this.vp.applyCssSizes(); // every page needs its CSS box (scroll geometry), painted or not
		let changed = 0;
		for (const p of this.pages) {
			if (!this.vp.inWindow(p.n)) continue; // off-window pages paint on scroll-in
			if (this.vp.prevRecords.get(p.n) !== p.records) {
				const cv = this.canvasEls[p.n - 1];
				if (cv && cv.width > 0) {
					// ONE visual swap per reconcile: hold the page's last frame (the
					// provisional patch, already ~the truth) and repaint once when the
					// fresh PDF raster lands -- painting records first and the raster
					// ~300ms later double-swapped the page at every typing pause
					this.bitmaps.requestBaseAuto(p.n);
				} else {
					await this.renderPage(p.n);
				}
				this.vp.prevRecords.set(p.n, p.records);
				changed++;
			}
		}
		this.vp.updateWindow();
		// drop stale hashes for removed pages
		for (const k of [...this.vp.prevRecords.keys()]) if (k > this.pages.length) this.vp.prevRecords.delete(k);
		const secs = (r.ms / 1000).toFixed(1);
		const pageCount =
			this.pages.length === 1
				? m.draft_compiled_pages_one({ count: this.pages.length })
				: m.draft_compiled_pages_other({ count: this.pages.length });
		const passesSuffix = (r.passes ?? 1) > 1 ? ` · ${m.draft_compiled_passes({ passes: r.passes })}` : '';
		this.compiler.status = `${m.draft_status_compiled({ secs })} · ${pageCount}${passesSuffix}`;
		this.ev('compiled', { pages: this.pages.length, passes: r.passes ?? 1, changed, ms: r.ms });
		const f = this.patcher.takeFocus();
		if (f) {
			// jump to the structurally-edited paragraph in the fresh layout: its text is on
			// the page now, so the content-based locate can find it. Best effort.
			locateParagraph(this.locateCtx, f.file, f.line, f.text, f.listItem, f.endLine)
				.then((fc) => {
					if ('bail' in fc) return;
					this.vp.showEditBand({
						page: fc.pageNo,
						top: fc.b1 - fc.medGap * 0.8,
						bottom: fc.bk + fc.medGap * 0.3,
						colL: fc.colL,
						colR: fc.colR
					});
					this.vp.followEdit(fc.pageNo, fc.b1, fc.bk, fc.colL, fc.colR);
				})
				.catch(() => {
					/* focus is cosmetic; never block the render on it */
				});
		}
	}

	instantPatch(req: PatchReq): Promise<void> {
		return this.patcher.instantPatch(req);
	}

	// inverse: double-click a page -> source location via the reconcile PDF's synctex
	async onCanvasDblClick(n: number, e: MouseEvent): Promise<void> {
		const nat = nativeBridge();
		const inverse = this.opts.onInverseSync();
		if (!nat || !inverse) return;
		const xPt = e.offsetX / this.vp.dispScale;
		const yPt = e.offsetY / this.vp.dispScale;
		this.vp.showClickMark(n, xPt, yPt);
		try {
			const res: any = await nat.synctex({
				action: 'edit',
				pdf: this.opts.root() + '/_draft/draft.pdf',
				page: n,
				x: xPt / BP2PT,
				y: yPt / BP2PT
			});
			this.ev('inverse-sync', { page: n, x: +xPt.toFixed(1), y: +yPt.toFixed(1), input: res?.input, line: res?.line });
			if (res?.ok && res.input && res.line >= 1)
				inverse(
					res.input,
					res.line,
					wordAt(this.pageRecords(n), (r) => this.fonts.textMapOf(r), xPt - this.paper.mx, yPt - this.paper.my)
				);
		} catch {
			/* sync is best-effort */
		}
	}

	// Save the reconcile PDF (the exact document the canvases mirror). A pending reconcile
	// or in-flight compile means the PDF is behind the preview: flush/refresh it first so
	// the saved file never trails the last edit.
	async savePdf(): Promise<void> {
		const nat = nativeBridge();
		if (!nat || this.savingPdf || !this.pages.length) return;
		this.savingPdf = true;
		try {
			if (await this.patcher.flushReconcile()) {
				await this.compiler.compile('save-pdf');
			} else if (this.compiler.compiling) {
				await this.compiler.compile('save-pdf'); // supersedes the in-flight run; this one owns the result
			}
			const name =
				this.opts
					.mainFile()
					.split('/')
					.pop()!
					.replace(/\.tex$/i, '') + '.pdf';
			const res = await nat.draftSavePdf({ root: this.opts.root(), defaultName: name });
			this.ev('save-pdf', { saved: res.saved, path: res.path });
			if (res.saved && res.path) this.compiler.status = m.draft_status_pdf_saved({ path: res.path });
		} catch (e) {
			this.compiler.status = m.draft_status_pdf_save_failed({ message: e instanceof Error ? e.message : String(e) });
		} finally {
			this.savingPdf = false;
		}
	}

	// forward: scroll + flash the box synctex reported for a source line (all args bp, v = baseline)
	syncTo(pageNo: number, hBp: number, vBp: number, wBp: number, hgtBp: number): void {
		if (pageNo < 1 || pageNo > this.pages.length) return;
		const colL = hBp * BP2PT - this.paper.mx;
		const bottom = vBp * BP2PT - this.paper.my;
		const top = bottom - Math.max(6, hgtBp * BP2PT);
		const colR = colL + Math.max(20, wBp * BP2PT);
		this.ev('forward-sync', { page: pageNo, top: +top.toFixed(1), bottom: +bottom.toFixed(1) });
		this.vp.showEditBand({ page: pageNo, top, bottom, colL, colR });
		const keep = this.vp.followEdits;
		this.vp.followEdits = true; // an explicit sync always navigates, even with follow-edits off
		this.vp.followEdit(pageNo, top, bottom, colL, colR);
		this.vp.followEdits = keep;
	}
}
