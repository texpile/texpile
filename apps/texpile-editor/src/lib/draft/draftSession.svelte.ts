/* eslint-disable @typescript-eslint/no-explicit-any */
// One live draft-preview session: owns the compiled document state (pages, paper, page records) and composes the
// fonts, bitmaps, viewport, compiler and teleport pieces. Everything painted came from the real engine; see
// DraftView.svelte for the view shell.
import { tick } from 'svelte';
import { parseRecords, pageIsRtl } from './records/pageRecords';
import { pdfDrawings, type PdfDrawing } from './records/pdfDrawings';
import type { PaperMetrics } from './draftPaper';
import { DraftFonts } from './paint/draftFonts';
import { DraftBitmaps } from './paint/draftBitmaps';
import { paintRecords, type PaintDeps } from './paint/draftPaint';
import { DraftViewport, type EditBand } from './draftViewport.svelte';
import { DraftCompiler } from './draftCompiler.svelte';
import { DraftTeleport, type TeleportLanded } from './draftTeleport.svelte';
import { editBand, shippedPage, type ShippedPage } from './records/editBand';
import { wordAt } from './records/draftWordAt';
import { shiftSourceLines, type SourceShift } from './records/sourceShifts';
import { BP2PT } from './texUnits';
import { saveDraftPdf } from './save/saveDraftPdf';
import { basename, nativeBridge, revealItem } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import type { DraftPage, DraftResult } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';

type SessionOpts = {
	root: () => string;
	mainFile: () => string;
	onInverseSync: () => ((file: string, line: number, selectText?: string) => void) | undefined;
	onSettled: () => (() => void) | undefined;
	onDiagnostics: () => ((logPath: string) => void) | undefined;
	settleEdits: () => (() => Promise<void>) | undefined;
	paused: () => boolean;
};

export class DraftSession {
	pages = $state<DraftPage[]>([]);
	paper = $state<PaperMetrics>({ w: 595, h: 842, mx: 72.27, my: 72.27, srcFiles: [] });
	canvasEls = $state<HTMLCanvasElement[]>([]);
	savingPdf = $state(false);
	/** the last compile found nothing to print */
	empty = $state(false);

	readonly fonts = new DraftFonts();
	readonly bitmaps: DraftBitmaps;
	readonly vp: DraftViewport;
	readonly compiler: DraftCompiler;
	readonly teleport: DraftTeleport;

	private parsedPages = new Map<number, any[]>();
	// pages a teleport drew since the last compile: its PDF does not have them, so they draw from records
	private notInPdf = new Set<number>();
	// the pages the latest teleport shipped, until its highlight is up
	private shipped: { seq: number; pages: ShippedPage[]; shown: boolean } = { seq: -1, pages: [], shown: false };
	/** an edit the engine refused shows with the next compile, which then takes the preview to it */
	private followCompile = false;
	private drawingsInPdf = new Map<string, PdfDrawing>();

	constructor(private opts: SessionOpts) {
		this.bitmaps = new DraftBitmaps({
			root: opts.root,
			paper: () => this.paper,
			dispScale: () => this.vp.dispScale,
			repaint: (n) => void this.renderPage(n),
			emit: (k, d) => this.ev(k, d)
		});
		this.vp = new DraftViewport({
			canvas: (n) => this.canvasEls[n - 1],
			pageCount: () => this.pages.length,
			recordsRaw: (n) => this.pages[n - 1]?.records ?? '',
			paper: () => this.paper,
			renderPage: (n) => this.renderPage(n),
			emit: (k, d) => this.ev(k, d)
		});
		this.compiler = new DraftCompiler({
			root: opts.root,
			mainFile: opts.mainFile,
			applyCompiled: (r) => this.applyCompiled(r),
			afterCompile: () => {
				// edits typed while the pass ran are measured against its fresh index now
				this.opts.onSettled()?.();
				// the draft compile writes its own log, which the Problems panel reads
				this.opts.onDiagnostics()?.(this.opts.root() + '/_draft/draft.log');
			},
			paused: opts.paused,
			emit: (k, d) => this.ev(k, d)
		});
		this.teleport = new DraftTeleport({
			root: opts.root,
			mainFile: opts.mainFile,
			applyPage: (p, seq) => this.applyPage(p, seq),
			landed: (r, seq) => this.landed(r, seq),
			moveSourceLines: (stop, shifts) => this.moveSourceLines(stop, shifts),
			compileInFlight: () => this.compiler.inFlight(),
			setStatus: (s) => (this.compiler.status = s),
			refused: () => (this.followCompile = true),
			emit: (k, d) => this.ev(k, d)
		});
	}

	// test hook: a structured decision log, read through window.__draftEvents
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
	// nothing on it may be painted from records -- it waits for the exact-PDF raster
	rtlPage(n: number): boolean {
		return pageIsRtl(this.pages[n - 1]?.unc);
	}

	private paintDeps(n: number): PaintDeps {
		return {
			fonts: this.fonts,
			bitmaps: this.bitmaps,
			paper: this.paper,
			inPdf: !this.notInPdf.has(n),
			drawingInPdf: (rec) => (rec.k ? this.drawingsInPdf.get(rec.k) : undefined)
		};
	}

	async renderPage(n: number): Promise<void> {
		const cv = this.canvasEls[n - 1];
		if (!cv || !this.vp.inWindow(n)) return;
		const records = this.pageRecords(n);
		await this.fonts.ensureFonts(records);
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
		// the exact-PDF raster is the resting view; the records draw covers the page until it lands, and for good on
		// a page the PDF does not have yet
		const inPdf = !this.notInPdf.has(n);
		const bkey = this.bitmaps.baseKey(n, dpr);
		const base = inPdf ? this.bitmaps.base(bkey) : undefined;
		if (base && base !== 'loading' && base !== 'failed') {
			ctx.drawImage(base as ImageBitmap, 0, 0, this.paper.w * S, this.paper.h * S);
			return;
		}
		if (inPdf && !base) this.bitmaps.requestBase(n, bkey);
		// hold the white page until the raster lands rather than flash mirrored text; a raster that can never land
		// falls through, as wrong-order ink still carries the words
		if (this.rtlPage(n) && inPdf && base !== 'failed') return;
		const drawings = paintRecords(ctx, records, S, 0, n, this.paintDeps(n));
		if (drawings.fromPdf || drawings.unmatched) this.ev('drawings', { page: n, ...drawings });
	}

	private async applyCompiled(r: Extract<DraftResult, { ok: true }>): Promise<void> {
		const shown = this.followCompile ? this.pages : [];
		this.followCompile = false;
		if (r.paperW > 0) {
			this.paper = { w: r.paperW, h: r.paperH, mx: r.marginX, my: r.marginY, srcFiles: r.srcFiles ?? [] };
			if (this.vp.fitMode) this.vp.fitToWidth(); // size to the pane now that the paper dims are known
		}
		this.pages = r.pages;
		this.empty = r.pages.length === 0;
		this.parsedPages.clear();
		this.notInPdf.clear();
		this.drawingsInPdf = pdfDrawings(r.pages);
		this.bitmaps.invalidate(); // crops and rasters come from THIS compile's PDF
		this.vp.clearEditBand();
		await tick(); // let the {#each} create/resize canvases
		this.vp.applyCssSizes(); // every page needs its CSS box (scroll geometry), painted or not
		let changed = 0;
		for (const p of this.pages) {
			if (!this.vp.inWindow(p.n)) continue; // off-window pages paint on scroll-in
			if (this.vp.prevRecords.get(p.n) !== p.records) {
				const cv = this.canvasEls[p.n - 1];
				// one visual swap: a page already on screen holds its frame until the fresh raster lands
				if (cv && cv.width > 0) this.bitmaps.requestBaseAuto(p.n);
				else await this.renderPage(p.n);
				this.vp.prevRecords.set(p.n, p.records);
				changed++;
			}
		}
		this.vp.updateWindow();
		if (shown.length) this.followCompiledEdit(shown);
		for (const k of [...this.vp.prevRecords.keys()]) if (k > this.pages.length) this.vp.prevRecords.delete(k);
		const secs = (r.ms / 1000).toFixed(1);
		const passesSuffix = (r.passes ?? 1) > 1 ? ` - ${m.draft_compiled_passes({ passes: r.passes })}` : '';
		this.compiler.status = `${m.draft_status_compiled({ secs })}${passesSuffix}`;
		this.ev('compiled', { pages: this.pages.length, passes: r.passes ?? 1, changed, ms: r.ms });
	}

	/** the first change a compile made to the pages shown before, as a teleport's band */
	private followCompiledEdit(shown: DraftPage[]): void {
		const changed = this.pages
			.filter((p) => shown[p.n - 1]?.records !== p.records)
			.map((p) => shippedPage(p.n, parseRecords(shown[p.n - 1]?.records ?? '').records, parseRecords(p.records).records));
		this.followBand(editBand(changed, true));
	}

	private followBand(band: EditBand | null): void {
		if (!band) return;
		this.ev('edit-band', band);
		this.vp.showEditBand(band);
		this.vp.followEdit(band.page, band.top, band.bottom, band.colL, band.colR);
	}

	/** a page a teleport shipped replaces the one shown; the lines holding the first word the edit changed take the highlight */
	private async applyPage(p: DraftPage, seq: number): Promise<void> {
		const after = parseRecords(p.records).records;
		if (seq !== this.shipped.seq) this.shipped = { seq, pages: [], shown: false };
		this.shipped.pages.push(shippedPage(p.n, this.pageRecords(p.n), after));
		const pages = [...this.pages];
		pages[p.n - 1] = p;
		for (let i = 0; i < pages.length; i++) if (!pages[i]) pages[i] = { n: i + 1, w: p.w, h: p.h, records: '' };
		this.pages = pages;
		this.empty = false;
		this.parsedPages.set(p.n, after);
		this.notInPdf.add(p.n);
		await tick();
		this.vp.applyCssSizes();
		await this.renderPage(p.n);
		this.vp.prevRecords.set(p.n, p.records);
		this.showShippedBand(seq, false);
	}

	private showShippedBand(seq: number, ended: boolean): void {
		if (seq !== this.shipped.seq || this.shipped.shown) return;
		const band = editBand(this.shipped.pages, ended);
		if (!band) return;
		this.shipped.shown = true;
		this.followBand(band);
	}

	private moveSourceLines(stop: number, shifts: SourceShift[]): void {
		const pages = [...this.pages];
		for (let i = stop; i < pages.length; i++) {
			const records = shiftSourceLines(pages[i].records, shifts);
			if (records === null) continue;
			pages[i] = { ...pages[i], records };
			this.parsedPages.delete(i + 1);
		}
		this.pages = pages;
	}

	/** a teleport finished: the pages past its stop keep their ink and move their source lines, or the count is new */
	private async landed(r: TeleportLanded, seq: number): Promise<void> {
		this.showShippedBand(seq, true);
		if (r.from !== undefined) this.compiler.typesetAgain();
		if (r.srcFiles.length) this.paper = { ...this.paper, srcFiles: r.srcFiles };
		if (r.shifts) this.moveSourceLines(r.stop ?? this.pages.length, r.shifts);
		// a title half typed prints nothing for a moment: the page shown stays until the pass after typing says so
		if (r.stop === undefined && this.pages.length > r.count && r.count > 0) {
			this.pages = this.pages.slice(0, r.count);
			await tick();
			this.vp.applyCssSizes();
		}
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

	async savePdf(): Promise<void> {
		const nat = nativeBridge();
		if (!nat || this.savingPdf || !this.pages.length) return;
		this.savingPdf = true;
		try {
			const name =
				this.opts
					.mainFile()
					.split('/')
					.pop()!
					.replace(/\.tex$/i, '') + '.pdf';
			const res = await saveDraftPdf({
				settleEdits: async () => {
					await this.opts.settleEdits()?.();
				},
				compile: () => this.compiler.compileToLand('save-pdf'),
				save: () => nat.draftSavePdf({ root: this.opts.root(), defaultName: name })
			});
			if (!res) return;
			this.ev('save-pdf', { saved: res.saved, path: res.path });
			// a toast, as the Typst preview's save gives: the status line is the preview's, not the file's
			const path = res.path;
			if (res.saved && path)
				toaster.success({
					title: m.pdf_saved_title(),
					description: basename(path),
					duration: 6000,
					action: { label: m.filetree_menu_reveal(), onClick: () => void revealItem(path) }
				});
		} catch (e) {
			toaster.error({ title: m.pdf_save_failed(), description: e instanceof Error ? e.message : String(e), duration: 8000 });
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
