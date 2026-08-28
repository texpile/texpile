/* eslint-disable @typescript-eslint/no-explicit-any */
// The instant-patch lifecycle: re-typeset one edited paragraph on the warm daemon and splice
// it into its page -- ONLY when provably identical to a full recompile; else demote to a
// tinted provisional + debounced reconcile, or an honest full pass.
import { INDENT_PREFIX } from './daemonIndent';
import { abandonToCompile } from './patch/abandonToCompile';
import { pageBreakCertificate, remapBandRecords, type Certificate, type FullCertificate } from './patch/pageCertificate';
import { SpillPatches } from './patch/spillPatches';
import { planOverflowSplit } from './heuristics/planOverflowSplit';
import { engineFlow } from './heuristics/engineFlow';
import { provisionalStage } from './heuristics/provisionalStage';
import { certifiable } from './heuristics/certifiable';
import { engineSplitTo } from './heuristics/engineSplitAssist';
import { buildColumnSplit } from './heuristics/buildColumnSplit';
import { computeReflow, buildBandPatch, lineExtents } from './heuristics/computeReflow';
import { whyPhrase } from './whyPhrase';
import type { Cal, CalBail, PaperMetrics } from './locate/locate.types';
import type { Patch, PatchReq } from './patch/patch.types';
import type { SeamEntry } from './patch/seam.types';
import type { EditBand } from './draftViewport.svelte';
import type { SkeletonItem, SkeletonResult } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';

type PatcherHooks = {
	hasNative: () => boolean;
	pageCount: () => number;
	compiling: () => boolean;
	setStatus: (s: string) => void;
	compile: (reason: string) => void;
	locate: (file: string, line: number, orig: string, listItem?: boolean, endLine?: number) => Promise<Cal | CalBail>;
	daemonTypeset: (body: { text: string; hsize?: number; splitTo?: number }) => Promise<any>;
	pageRecords: (n: number) => any[];
	colBottomOf: (p: number) => number;
	contentFloor: (p: number) => number;
	paper: () => PaperMetrics;
	/** the shipped vpack stretched this page to \textheight: deltas distribute over glue */
	pageStretchy: (p: number) => boolean;
	missingInk: (records: any[]) => Promise<boolean>;
	/** record the live patch and paint it (activePatch.set + renderPage + patchedPages.add) */
	applyPatch: (n: number, p: Patch | Patch[]) => Promise<void>;
	/** drop a page's live patch and repaint it from records */
	clearPatch: (n: number) => Promise<void>;
	showEditBand: (b: EditBand, holdMs?: number) => void;
	synctex: (body: Record<string, unknown>) => Promise<any>;
	pdfPath: () => string;
	/** engine page-break certificate: re-split a dimension skeleton on the warm daemon */
	splitSkeleton: (items: SkeletonItem[], targetPt: number, capacity?: boolean) => Promise<SkeletonResult>;
	/** per-break pruned runs from the last compile (junction truth for moved breaks) */
	seams: () => SeamEntry[];
	/** a right-to-left page paints from the raster only: no patch may target it */
	pageIsRtl: (p: number) => boolean;
	/** the engine fills this page's columns to their goal (see heuristics/packsToGoal) */
	packsToGoal: (p: number) => boolean;
	followEdit: (page: number, top: number, bottom: number, colL?: number, colR?: number) => void;
	emit: (kind: string, detail?: unknown) => void;
};

export class DraftPatcher {
	// pages showing a "close enough" provisional patch (the paragraph is exact, only the reflow
	// below is approximate) while a full compile reconciles the true layout -- tinted in the view
	provisionalPages = $state(new Set<number>());

	private patching = false;
	private patchingSince = 0;
	// the run that owns the patch flag: a stuck-patch takeover starts a new one, and the
	// abandoned run must not paint, un-tint, or release the flag behind its successor
	private patchRun = 0;
	private queuedPatch: PatchReq | null = null;
	// the reconcile after a provisional patch is DEBOUNCED: keep patching provisionally at typing
	// speed and run ONE full pass when the user pauses (an immediate recompile per keystroke lags)
	private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingReconcile: (() => void | Promise<void>) | null = null;
	// only complain if its slow
	private refineStatusTimer: ReturnType<typeof setTimeout> | null = null;
	// geometry located once per paragraph per compile; keystrokes reuse it
	private calCache = new Map<string, Cal | CalBail>();
	// bumped when a compile replaces the pages: a patch spanning that landing was built
	// against replaced geometry and must not paint
	private geometryEpoch = 0;
	// a structural edit (new/split/deleted paragraph) has no patch to follow -- the editor
	// registers the paragraph that diverged; after the recompile we locate and highlight it
	private pendingFocus: { file: string; line: number; endLine: number; text: string; listItem?: boolean } | null = null;
	private spills: SpillPatches;

	constructor(private hooks: PatcherHooks) {
		this.spills = new SpillPatches(hooks);
	}

	/** a patch is mid-flight (the daemon warm-ready status must not overwrite its message) */
	get inFlight(): boolean {
		return this.patching;
	}

	setFocus(req: NonNullable<typeof this.pendingFocus>): void {
		this.pendingFocus = req;
	}
	takeFocus(): typeof this.pendingFocus {
		const f = this.pendingFocus;
		this.pendingFocus = null;
		return f;
	}

	/** a compile landed: located geometry is stale, paragraphs re-locate on the next patch */
	geometryChanged(): void {
		this.geometryEpoch++;
		this.calCache.clear();
	}

	/** compile finished: drop the tint and run any edit that arrived mid-compile */
	afterCompile(): void {
		this.spills.reset();
		if (this.provisionalPages.size) this.provisionalPages = new Set();
		if (this.queuedPatch) {
			const q = this.queuedPatch;
			this.queuedPatch = null;
			void this.instantPatch(q);
		}
	}

	/** savePdf: flush a pending debounced reconcile right now; true if one was pending */
	async flushReconcile(): Promise<boolean> {
		if (!this.reconcileTimer) return false;
		clearTimeout(this.reconcileTimer);
		this.reconcileTimer = null;
		const r = this.pendingReconcile;
		this.pendingReconcile = null;
		await r?.();
		return true;
	}

	private noteRefining(page: number): void {
		if (this.refineStatusTimer) clearTimeout(this.refineStatusTimer);
		this.refineStatusTimer = setTimeout(() => {
			this.refineStatusTimer = null;
			if (this.provisionalPages.size) this.hooks.setStatus(m.draft_status_refining({ page }));
		}, 2000);
	}

	private scheduleReconcile(onRecompile: (() => void | Promise<void>) | undefined, stage: string): void {
		this.pendingReconcile = onRecompile ?? null;
		if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
		this.reconcileTimer = setTimeout(async () => {
			this.reconcileTimer = null;
			const r = this.pendingReconcile;
			this.pendingReconcile = null;
			await r?.();
			this.hooks.compile('provisional:' + stage);
		}, 700);
	}

	private markProvisional(...pageNos: number[]): void {
		const s = new Set(this.provisionalPages);
		for (const p of pageNos) s.add(p);
		this.provisionalPages = s;
	}

	private unmarkProvisional(pageNos: number[]): void {
		if (!this.provisionalPages.size) return;
		const s = new Set(this.provisionalPages);
		let changed = false;
		for (const p of pageNos) changed = s.delete(p) || changed;
		if (changed) this.provisionalPages = s;
	}

	/** paint a multi-page flow render and carry its exact/provisional effects */
	private async renderFlow(
		req: PatchReq,
		cal: Cal,
		t0: number,
		stale: () => boolean,
		plan: { pages: { page: number; segs: Patch[] }[]; exact?: boolean; endPage: number; hops?: number },
		band: { top: number; bottom: number },
		ev: { kind?: string; stage: string; detail: Record<string, unknown> }
	): Promise<void> {
		const h = this.hooks;
		const cleared = await this.spills.paint(plan.pages, stale);
		if (!cleared) return;
		h.showEditBand({ page: cal.pageNo, top: band.top, bottom: band.bottom, colL: cal.colL, colR: cal.colR });
		h.followEdit(cal.pageNo, cal.b1, band.bottom, cal.colL, cal.colR);
		h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: (performance.now() - t0).toFixed(0) }));
		const detail = { page: cal.pageNo, spillPage: plan.endPage, hops: plan.hops ?? 1, ...ev.detail };
		if (plan.exact) {
			// engine-answered end to end: band lines, every column's respace, every junction's
			// seam, and the final break's fate -- nothing to refine. Pages a shorter chain
			// stopped reaching lose the tint too: their patch just came off.
			this.unmarkProvisional([...plan.pages.map((p) => p.page), ...cleared]);
			h.emit(ev.kind ?? 'patched', { ...detail, endPage: plan.endPage });
			if (!req.transient) this.scheduleReconcile(req.onRecompile, 'baseline');
		} else {
			this.markProvisional(...plan.pages.map((p) => p.page));
			h.emit('provisional-split', { ...detail, stage: ev.stage });
			this.noteRefining(cal.pageNo);
			if (!req.transient) this.scheduleReconcile(req.onRecompile, ev.stage);
		}
	}

	async instantPatch(req: PatchReq): Promise<void> {
		const h = this.hooks;
		if (!h.hasNative() || !h.pageCount() || h.compiling()) {
			// while a compile is in flight, hold the latest edit; run it once compile finishes
			if (h.compiling()) this.queuedPatch = req;
			h.emit('bail', !h.hasNative() ? 'no-native' : !h.pageCount() ? 'no-pages' : 'compiling');
			return;
		}
		if (this.patching) {
			// a patch wedged mid-flight (a native call that never settled) must not swallow
			// every future edit silently: after 15s declare it dead and take over -- all the
			// daemon paths time out well under that, so the old run cannot still be live
			if (performance.now() - this.patchingSince > 15000) {
				h.emit('patch-stuck-reset', { since: Math.round(performance.now() - this.patchingSince) });
			} else {
				this.queuedPatch = req;
				h.emit('bail', 'patch-in-flight');
				return;
			}
		}
		const run = ++this.patchRun;
		this.patching = true;
		this.patchingSince = performance.now();
		const t0 = performance.now();
		try {
			h.emit('patch-start', {
				file: req.file,
				line: req.line,
				origLen: req.orig.length,
				textLen: req.text.length,
				origHead: req.orig.slice(0, 50)
			});
			const key = `${req.file}:${req.line}`;
			const epoch = this.geometryEpoch;
			const stale = () => {
				// a takeover already replaced this run: its successor carries the edit
				if (this.patchRun !== run) return true;
				if (epoch === this.geometryEpoch) return false;
				// a compile landed mid-patch: re-run the edit against the fresh geometry
				this.queuedPatch ??= req;
				h.emit('stale-geometry', { key });
				return true;
			};
			let cal = this.calCache.get(key);
			if (!cal) {
				cal = await h.locate(req.file, req.line, req.orig, req.listItem, req.endLine);
				// a locate that spanned a compile landing must not poison the fresh cache
				if (epoch === this.geometryEpoch) this.calCache.set(key, cal);
			}
			if (stale()) return;
			if ('bail' in cal) {
				// A page-PERMANENT bail is not worth a compile per keystroke. Most bail reasons
				// describe this edit against this layout, so recompiling produces a page the next
				// keystroke can patch -- worth doing at once. `page-rtl` is a property of the PAGE:
				// the recompile lands another right-to-left page, the next keystroke bails
				// identically, and the one after that. Left on the immediate path it ran a full
				// lualatex pass and an autosave on EVERY keystroke, which is what made typing in a
				// Hebrew document thrash. Debounced, it behaves the way a document with no live
				// preview does: recompile once, when the typing stops.
				if (cal.bail === 'page-rtl' || cal.invisible) {
					// page-rtl announces itself; an invisible paragraph (\eat, \footnotetext)
					// reconciles in silence -- each keystroke's full pass would show nothing new
					if (cal.bail === 'page-rtl') h.setStatus(m.draft_status_recompiling({ reason: whyPhrase(cal.bail) }));
					h.emit('abandon-debounced', { stage: cal.bail, key });
					this.scheduleReconcile(req.onRecompile, cal.bail);
					return;
				}
				await abandonToCompile(h, req, cal.bail, { key });
				return;
			}
			h.emit('located', { key, page: cal.pageNo });
			// cal.indent: the page paragraph is TeX-indented (the CALIBRATION discovered this
			// by typesetting both variants through the engine and matching the page), so the
			// edit carries the same engine-resolved \hspace*{\parindent}. cal.pre likewise
			// carries a narrowed environment's engine-measured font. An edit that changes
			// the paragraph's command set (e.g. typing \noindent) is cmdChanged and always
			// reconciles -- the engine certifies whatever the commands mean.
			const sendText = (cal.pre ?? '') + (cal.indent && !req.listItem ? INDENT_PREFIX : '') + req.text;
			const r = await h.daemonTypeset({ text: sendText, hsize: cal.W });
			if (!r.ok || (r.stats && (r.stats as any).certified === false)) {
				await abandonToCompile(h, req, 'typeset', { ok: r.ok });
				return;
			}
			const lineRecs = r.records.filter((x: any) => x.t === 'line');
			if (!lineRecs.length) {
				await abandonToCompile(h, req, 'no-lines');
				return;
			}
			const { h1, dk } = lineExtents(lineRecs);
			if (cal.spill) {
				const split = buildColumnSplit(cal as Cal & { spill: NonNullable<Cal['spill']> }, r.records, lineRecs, {
					h1,
					dk,
					colBottom: h.colBottomOf(cal.pageNo),
					contentFloorOf: h.contentFloor,
					pageRecords: h.pageRecords,
					engine: await engineSplitTo(h.daemonTypeset, sendText, cal.W, h.colBottomOf(cal.pageNo) - (cal.b1 - h1))
				});
				const { segA, segB, spillPage } = split;
				if (stale()) return;
				const pages = [
					{ page: cal.pageNo, segs: [segA] },
					{ page: spillPage, segs: [segB] }
				];
				await this.renderFlow(
					req,
					cal,
					t0,
					stale,
					{ pages, endPage: spillPage },
					{ top: cal.b1 - h1, bottom: cal.bk + dk },
					{ stage: 'split', detail: { kA: split.kA, of: lineRecs.length } }
				);
				return;
			}
			const colBottom = h.colBottomOf(cal.pageNo);
			const floorA = h.contentFloor(cal.pageNo);
			const spillCtx = { pageRecords: h.pageRecords, contentFloor: h.contentFloor, pageCount: h.pageCount, colSep: h.paper().colSep };
			const flow = computeReflow(cal, r.records, lineRecs, { dk, colBottom, floorA, pageRecords: h.pageRecords });
			// Footnote body text lives at the page bottom, outside the patch band: any
			// footnote-bearing paragraph reconciles. (A char-code signature comparison used to
			// license EXACT body patches -- deleted: it was blind to font/position changes, and
			// whether the page-bottom note block still matches is the engine's call.)
			const footnote = /\\footnote/.test(req.text) || /\\footnote/.test(req.orig);
			const fontGap = await h.missingInk(r.records as any[]);
			// Engine page-break certificate: two skeleton splits on the warm daemon --
			// calibrate on the unedited column, then re-split with the edited band spliced in.
			// Break held -> the certified baselines respace band and column to the engine's
			// own numbers, so stretch-approx locates and underflow stop demoting. Break moved,
			// or any refusal -> the existing provisional path stands unchanged.
			const facts = { stretchy: h.pageStretchy(cal.pageNo), footnote, fontGap, delta: flow.delta, underflow: flow.underflow };
			let cert: Certificate | null = certifiable(cal, req, facts)
				? await pageBreakCertificate(
						{ pageRecords: h.pageRecords, splitSkeleton: h.splitSkeleton, emit: h.emit },
						cal,
						r.records as any[],
						colBottom,
						h.paper().topSkip
					)
				: null;
			// The engine's flow render: a moved break chains forward through the next slots,
			// a shrunk band pulls content back. Fully certified -> EXACT, no tint.
			const chainDeps = {
				splitSkeleton: h.splitSkeleton,
				seams: h.seams,
				colBottomOf: h.colBottomOf,
				packsToGoal: h.packsToGoal,
				pageIsRtl: h.pageIsRtl,
				emit: h.emit
			};
			if (cert) {
				const geom = { y0: flow.y0, h1, dk, floorA };
				const render = await engineFlow(chainDeps, spillCtx, cal, cert, r.records as any[], geom, h.paper().topSkip);
				if (render) {
					if (stale()) return;
					await this.renderFlow(req, cal, t0, stale, render.plan, render.band, render.ev);
					return;
				}
				// a shrink the pull chain could not answer keeps today's un-pulled render
				if (cert.shrunk) cert = null;
			}
			// JS-predicted overflow: the engine refused a certificate, named a break inside
			// the band, or could not chain -- the split planners (with the daemon's \vsplit
			// assist) render the motion first-order. Always provisional.
			if (flow.overflow && (!cert || !cert.fits)) {
				const plan = planOverflowSplit(spillCtx, cal, r.records as any[], lineRecs as any[], {
					h1,
					dk,
					delta: flow.delta,
					colBottom,
					belowBases: flow.belowBases,
					lastBelow: flow.lastBelow,
					engine: await engineSplitTo(h.daemonTypeset, sendText, cal.W, colBottom - (cal.b1 - h1))
				});
				if (plan) {
					const { segA, segsB, samePage, spillPage } = plan;
					if (stale()) return;
					const pages = [
						{ page: cal.pageNo, segs: [segA] },
						{ page: spillPage, segs: segsB }
					];
					await this.renderFlow(
						req,
						cal,
						t0,
						stale,
						{ pages, endPage: spillPage },
						{ top: segA.top, bottom: cal.bk + dk },
						{
							stage: 'overflow',
							detail: { kA: plan.kA, of: plan.lineCount, moved: plan.movedCount, target: samePage ? 'next-col' : 'next-page' }
						}
					);
					return;
				}
			}
			// full certificate (same line count) carries the engine's baselines; a fit-only
			// certificate (grown band) just answers whether the page still holds the content
			const fullCert = cert?.fits && cert.bandAbsYs ? (cert as FullCertificate) : null;
			const certRecs = fullCert ? remapBandRecords(r.records as any[], fullCert.bandAbsYs, cal.b1 - flow.y0) : null;
			const certExact = !!fullCert && !!certRecs && fullCert.maxAboveDy <= 0.2;
			const stage = provisionalStage({
				overflow: flow.overflow,
				underflow: flow.underflow,
				certified: !!cert,
				certFits: !!cert?.fits,
				certExact,
				fullCert: !!fullCert,
				approx: !!cal.approx,
				approxStretch: !!cal.approxStretch,
				floatInner: !!req.floatInner,
				footnote,
				fontGap,
				cmdChanged: !!req.cmdChanged,
				transient: !!req.transient
			});
			const patchObj = buildBandPatch(cal, (certRecs ?? r.records) as any[], {
				y0: flow.y0,
				h1,
				dk,
				delta: flow.delta,
				floorA,
				stretchy: h.pageStretchy(cal.pageNo),
				pageRecords: h.pageRecords,
				cert: certRecs && fullCert ? { steps: fullCert.steps } : undefined
			});
			if (stale()) return;
			// this render no longer spills: spill segments a previous keystroke left on
			// other pages must come off, or their carried rows double-draw
			const dropped = await this.spills.drop(cal.pageNo);
			await h.applyPatch(cal.pageNo, patchObj); // survives zoom re-renders until the next compile
			h.showEditBand({
				page: cal.pageNo,
				top: patchObj.top,
				bottom: cal.bk + dk + Math.max(0, flow.delta),
				colL: cal.colL,
				colR: cal.colR
			});
			h.followEdit(cal.pageNo, cal.b1, cal.bk + dk, cal.colL, cal.colR); // zoom+center on the edit (Typst-style)
			const ms = performance.now() - t0;
			if (stage) {
				this.markProvisional(cal.pageNo); // tint until the recompile lands
				h.emit('provisional', { stage, page: cal.pageNo, delta: +flow.delta.toFixed(1), transient: !!req.transient });
				h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: ms.toFixed(0) }));
				this.noteRefining(cal.pageNo);
				// debounced reconcile: the provisional render carries the typing; ONE full pass
				// runs after the user pauses instead of one per keystroke. Transient (repaired
				// mid-typing) edits never schedule one -- the balanced keystroke that follows will.
				if (!req.transient) this.scheduleReconcile(req.onRecompile, stage);
			} else {
				// the edit page, and any spill page whose patch just came off with it
				this.unmarkProvisional([cal.pageNo, ...dropped]);
				h.emit('patched', { page: cal.pageNo, delta: +flow.delta.toFixed(1), ms: +ms.toFixed(0) });
				h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: ms.toFixed(0) }));
				// exact patches never advanced the baseline, so the FIRST edit in any other
				// paragraph read as two pending edits -> a visible full pass. A quiet pass at
				// the typing pause re-baselines, so moving to another section stays instant.
				if (!req.transient) this.scheduleReconcile(req.onRecompile, 'baseline');
			}
		} catch (e) {
			h.emit('error', String(e));
			// instant path is best-effort; the debounced full recompile always follows
		} finally {
			// only the owning run releases the flag: a run a takeover abandoned would
			// otherwise unlock (and start draining the queue) under its live successor
			if (this.patchRun === run) {
				this.patching = false;
				if (this.queuedPatch) {
					const q = this.queuedPatch;
					this.queuedPatch = null;
					void this.instantPatch(q);
				}
			}
		}
	}
}
