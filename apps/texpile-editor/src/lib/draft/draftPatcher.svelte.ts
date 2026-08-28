/* eslint-disable @typescript-eslint/no-explicit-any */
// The instant-patch lifecycle: re-typeset one edited paragraph on the warm daemon and splice
// it into its page -- ONLY when provably identical to a full recompile; else demote to a
// tinted provisional + debounced reconcile, or an honest full pass.
import { INDENT_PREFIX } from './daemonIndent';
import { abandonBand } from './heuristics/abandonBand';
import { pageBreakCertificate, remapBandRecords, type Certificate, type FullCertificate } from './patch/pageCertificate';
import { SpillPatches } from './patch/spillPatches';
import { planOverflowSplit } from './heuristics/planOverflowSplit';
import { planBreakMotion } from './heuristics/planBreakMotion';
import { buildColumnSplit } from './heuristics/buildColumnSplit';
import { computeReflow, buildBandPatch, lineExtents } from './heuristics/computeReflow';
import { whyPhrase } from './whyPhrase';
import type { Cal, CalBail, PaperMetrics } from './locate/locate.types';
import type { Patch, PatchReq } from './patch/patch.types';
import type { EditBand } from './draftViewport.svelte';
import type { SkeletonItem, SkeletonResult } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';

// a recompile-bound highlight must survive until the compile lands (which clears it);
// long documents can take several seconds, and an early fade reads as "nothing happened"
const RECOMPILE_BAND_HOLD = 8000;

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
	followEdit: (page: number, top: number, bottom: number, colL?: number, colR?: number) => void;
	emit: (kind: string, detail?: unknown) => void;
};

export class DraftPatcher {
	// pages showing a "close enough" provisional patch (the paragraph is exact, only the reflow
	// below is approximate) while a full compile reconciles the true layout -- tinted in the view
	provisionalPages = $state(new Set<number>());

	private patching = false;
	private patchingSince = 0;
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
		this.patching = true;
		this.patchingSince = performance.now();
		const t0 = performance.now();
		// abandon -> save (so the recompile sees the buffer) + advance the editor's baseline,
		// then full-recompile
		async function recompile(stage: string, detail?: unknown) {
			// a TRANSIENT (auto-repaired mid-typing) edit may only patch or hold, never compile:
			// its source is a half-typed state not worth a full pass; the balanced keystroke
			// that follows re-evaluates normally
			if (req.transient) {
				h.emit('transient-hold', { stage });
				return;
			}
			h.emit('abandon', { stage, ...(typeof detail === 'object' ? detail : { detail }) });
			await req.onRecompile?.();
			// the edit still deserves a place on the page while the full pass runs: synctex
			// is too fuzzy to anchor a splice, but a highlight only needs roughly the right
			// rows. The landing compile clears the band (fresh layout may have shifted it).
			try {
				const sx: any = await h.synctex({
					action: 'view',
					pdf: h.pdfPath(),
					tex: req.file.replace(/\\/g, '/'),
					line: req.line,
					column: 0
				});
				const band = abandonBand(((sx && sx.boxes) || []) as any[], h.paper() as any);
				if (band) {
					h.showEditBand(band, RECOMPILE_BAND_HOLD);
					h.followEdit(band.page, band.top, band.bottom, band.colL, band.colR);
				}
			} catch {
				// hint only; the status line still says why
			}
			// the daemon SURVIVES this: an abandon means "this edit renders via a full pass",
			// never an engine reload (that only happens on a preamble change)
			h.setStatus(m.draft_status_not_instant({ reason: whyPhrase(stage) }));
			h.compile('abandon:' + stage);
		}
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
				await recompile(cal.bail, { key });
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
				await recompile('typeset', { ok: r.ok });
				return;
			}
			const lineRecs = r.records.filter((x: any) => x.t === 'line');
			if (!lineRecs.length) {
				await recompile('no-lines');
				return;
			}
			const { h1, dk } = lineExtents(lineRecs);
			// the ENGINE's break row for a column split: re-typeset with \vsplit to the
			// column's remaining height, so vert_break (club/widow penalties included) picks
			// the cut. Refused or empty -> the JS arithmetic in the planners stands in.
			const calW = cal.W;
			async function engineSplitTo(room: number): Promise<{ recsA: any[]; recsB: any[] } | undefined> {
				if (!(room > 0)) return undefined;
				const rs = await h.daemonTypeset({ text: sendText, hsize: calW, splitTo: room });
				if (rs.ok && rs.splitRecords?.length && rs.records.some((x: any) => x.t === 'line')) {
					return { recsA: rs.records, recsB: rs.splitRecords };
				}
				return undefined;
			}
			if (cal.spill) {
				const split = buildColumnSplit(cal as Cal & { spill: NonNullable<Cal['spill']> }, r.records, lineRecs, {
					h1,
					dk,
					colBottom: h.colBottomOf(cal.pageNo),
					contentFloorOf: h.contentFloor,
					pageRecords: h.pageRecords,
					engine: await engineSplitTo(h.colBottomOf(cal.pageNo) - (cal.b1 - h1))
				});
				const { segA, segB, spillPage } = split;
				if (stale()) return;
				if (!(await this.spills.paint(key, cal.pageNo, spillPage, segA, [segB], stale))) return;
				this.markProvisional(cal.pageNo, spillPage);
				h.showEditBand({ page: cal.pageNo, top: cal.b1 - h1, bottom: cal.bk + dk, colL: cal.colL, colR: cal.colR });
				h.followEdit(cal.pageNo, cal.b1, cal.bk, cal.colL, cal.colR);
				h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: (performance.now() - t0).toFixed(0) }));
				this.noteRefining(cal.pageNo);
				h.emit('provisional-split', { page: cal.pageNo, spillPage, kA: split.kA, of: lineRecs.length });
				if (!req.transient) this.scheduleReconcile(req.onRecompile, 'split');
				return;
			}
			const colBottom = h.colBottomOf(cal.pageNo);
			const floorA = h.contentFloor(cal.pageNo);
			const spillCtx = { pageRecords: h.pageRecords, contentFloor: h.contentFloor, pageCount: h.pageCount, colSep: h.paper().colSep };
			const flow = computeReflow(cal, r.records, lineRecs, { dk, colBottom, floorA, pageRecords: h.pageRecords });
			// Overflow renders TRUTHFULLY: whatever the shift pushes past the column bottom
			// moves to the top of the next slot in reading order, pushing that slot's content
			// down, instead of cramming rows past the bottom under the tint. Always provisional.
			if (flow.overflow) {
				const plan = planOverflowSplit(spillCtx, cal, r.records as any[], lineRecs as any[], {
					h1,
					dk,
					delta: flow.delta,
					colBottom,
					belowBases: flow.belowBases,
					lastBelow: flow.lastBelow,
					engine: await engineSplitTo(colBottom - (cal.b1 - h1))
				});
				if (plan) {
					const { segA, segsB, samePage, spillPage } = plan;
					if (stale()) return;
					if (!(await this.spills.paint(key, cal.pageNo, spillPage, segA, segsB, stale))) return;
					this.markProvisional(cal.pageNo, spillPage);
					h.showEditBand({ page: cal.pageNo, top: segA.top, bottom: cal.bk + dk, colL: cal.colL, colR: cal.colR });
					h.followEdit(cal.pageNo, cal.b1, cal.bk + dk, cal.colL, cal.colR);
					h.emit('provisional-split', {
						page: cal.pageNo,
						spillPage,
						kA: plan.kA,
						of: plan.lineCount,
						moved: plan.movedCount,
						stage: 'overflow',
						target: samePage ? 'next-col' : 'next-page'
					});
					h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: (performance.now() - t0).toFixed(0) }));
					this.noteRefining(cal.pageNo);
					if (!req.transient) this.scheduleReconcile(req.onRecompile, 'overflow');
					return;
				}
			}
			// Footnote body text lives at the page bottom, outside the patch band: any
			// footnote-bearing paragraph reconciles. (A char-code signature comparison used to
			// license EXACT body patches -- deleted: it was blind to font/position changes, and
			// whether the page-bottom note block still matches is the engine's call.)
			const footnote = /\\footnote/.test(req.text) || /\\footnote/.test(req.orig);
			const fontGap = await h.missingInk(r.records as any[]);
			// Engine page-break certificate (stretched pages): two skeleton splits on the warm
			// daemon -- calibrate on the unedited column, then re-split with the edited band
			// spliced in. Break held -> the certified baselines respace band and column to the
			// engine's own numbers, so stretch-approx locates and underflow stop demoting.
			// Break moved, or any refusal -> the existing provisional path stands unchanged.
			let cert: Certificate | null = null;
			if (
				h.pageStretchy(cal.pageNo) &&
				!cal.spill &&
				!req.transient &&
				!req.floatInner &&
				!footnote &&
				!fontGap &&
				!req.cmdChanged &&
				(!cal.approx || cal.approxStretch) &&
				(flow.delta !== 0 || flow.underflow || cal.approxStretch)
			) {
				cert = await pageBreakCertificate(
					{ pageRecords: h.pageRecords, splitSkeleton: h.splitSkeleton, emit: h.emit },
					cal,
					r.records as any[],
					colBottom
				);
			}
			// Engine-detected moved break: render the motion through the spill machinery
			// instead of cramming the shifted rows past the bottom under the tint. The carried
			// boxes are the capacity split's, the slot placement first-order -> provisional.
			if (cert && !cert.fits && cert.moved) {
				const bandRecs = remapBandRecords(r.records as any[], cert.moved.bandAbsYs, cal.b1 - flow.y0);
				const plan = bandRecs ? planBreakMotion(spillCtx, cal, bandRecs, cert.moved, { y0: flow.y0, h1, dk, floorA }) : null;
				if (plan) {
					if (stale()) return;
					if (!(await this.spills.paint(key, cal.pageNo, plan.spillPage, plan.segA, [plan.segB], stale))) return;
					this.markProvisional(cal.pageNo, plan.spillPage);
					h.showEditBand({ page: cal.pageNo, top: plan.segA.top, bottom: cal.bk + dk, colL: cal.colL, colR: cal.colR });
					h.followEdit(cal.pageNo, cal.b1, cal.bk + dk, cal.colL, cal.colR);
					h.emit('provisional-split', {
						page: cal.pageNo,
						spillPage: plan.spillPage,
						moved: plan.carried,
						stage: 'engine-overflow',
						target: plan.samePage ? 'next-col' : 'next-page'
					});
					h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: (performance.now() - t0).toFixed(0) }));
					this.noteRefining(cal.pageNo);
					if (!req.transient) this.scheduleReconcile(req.onRecompile, 'engine-overflow');
					return;
				}
			}
			// full certificate (same line count) carries the engine's baselines; a fit-only
			// certificate (grown band) just answers whether the page still holds the content
			const fullCert = cert?.fits && cert.bandAbsYs ? (cert as FullCertificate) : null;
			const certRecs = fullCert ? remapBandRecords(r.records as any[], fullCert.bandAbsYs, cal.b1 - flow.y0) : null;
			// the renderer never moves content ABOVE the band; a certificate that needs it
			// visibly moved renders the exact band/below anyway but keeps the tint
			const certExact = !!fullCert && !!certRecs && fullCert.maxAboveDy <= 0.2;
			// an approx locate is placement-correct but break-inexact: always provisional. A
			// float-inner patch (tabular inside a \begin{table}) is provisional too: the cell
			// content is exact but auto column widths / float placement are the full pass's call.
			// A transient (auto-repaired mid-typing) render carries INVENTED closers: it may
			// hold the screen for as long as the user pauses unbalanced, so it must wear the
			// tint -- nothing uncertified sits on screen looking final.
			const provisionalStage = flow.overflow
				? 'overflow'
				: cert && !cert.fits
					? 'engine-overflow'
					: flow.underflow && !cert
						? 'underflow'
						: cal.approx && !(cal.approxStretch && certExact)
							? 'approx-locate'
							: req.floatInner
								? 'float-inner'
								: footnote
									? 'footnote'
									: fontGap
										? 'font-missing'
										: req.cmdChanged
											? 'command-changed'
											: req.transient
												? 'transient'
												: fullCert && !certExact
													? 'respace-above'
													: null;
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
			// this render no longer spills: a spill segment a previous keystroke left on
			// another page must come off, or its carried rows double-draw
			await this.spills.drop(key, cal.pageNo);
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
			if (provisionalStage) {
				this.markProvisional(cal.pageNo); // tint until the recompile lands
				h.emit('provisional', { stage: provisionalStage, page: cal.pageNo, delta: +flow.delta.toFixed(1), transient: !!req.transient });
				h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: ms.toFixed(0) }));
				this.noteRefining(cal.pageNo);
				// debounced reconcile: the provisional render carries the typing; ONE full pass
				// runs after the user pauses instead of one per keystroke. Transient (repaired
				// mid-typing) edits never schedule one -- the balanced keystroke that follows will.
				if (!req.transient) this.scheduleReconcile(req.onRecompile, provisionalStage);
			} else {
				if (this.provisionalPages.has(cal.pageNo)) {
					const s = new Set(this.provisionalPages);
					s.delete(cal.pageNo);
					this.provisionalPages = s;
				}
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
			this.patching = false;
			if (this.queuedPatch) {
				const q = this.queuedPatch;
				this.queuedPatch = null;
				void this.instantPatch(q);
			}
		}
	}
}
