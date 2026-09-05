/* eslint-disable @typescript-eslint/no-explicit-any */
// The instant-patch lifecycle: re-typeset one edited paragraph on the warm daemon and splice
// it into its page -- ONLY when provably identical to a full recompile; else nothing is
// painted and the full pass runs. Two outcomes, no middle: the tinted "close enough" tier
// that used to sit between them graded 62-66% wrong against the reconcile, so it was showing
// the wrong page more often than the right one and calling it a render.
import { INDENT_PREFIX } from './daemonIndent';
import { abandonToCompile } from './patch/abandonToCompile';
import { pageBreakCertificate, remapBandRecords, type Certificate, type FullCertificate } from './patch/pageCertificate';
import { bandStampOf } from './patch/recordsAfterPatch';
import { showFocus } from './patch/showFocus';
import { whyNotExact } from './heuristics/whyNotExact';
import { certifiable } from './heuristics/certifiable';
import { bandChanged } from './heuristics/eligibility/bandChanged';
import { planHop } from './heuristics/planHop';
import { columnIndexOf } from './heuristics/seams';
import { editFocus } from './heuristics/editFocus';
import { computeReflow, buildBandPatch, lineExtents } from './heuristics/computeReflow';
import { whyPhrase } from './whyPhrase';
import type { Cal, CalBail, PaperMetrics } from './locate/locate.types';
import type { Patch, PatchReq } from './patch/patch.types';
import type { SeamEntry } from './patch/seam.types';
import type { PageColumn } from './geometry/pageColumns';
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
	/** first source line of this block that actually produced a galley line (see locate/bandStart) */
	bandStart: (file: string, line: number, endLine: number) => number;
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
	/** install the records this patch produced, so the store describes what is on screen.
	 *  false = it declined, and the caller must fall back to the recompile */
	adoptPatchedRecords: (n: number, p: Patch, stamp: { s?: number; sf?: number }) => boolean;
	showEditBand: (b: EditBand, holdMs?: number) => void;
	synctex: (body: Record<string, unknown>) => Promise<any>;
	pdfPath: () => string;
	/** engine page-break certificate: re-split a dimension skeleton on the warm daemon */
	splitSkeleton: (items: SkeletonItem[], targetPt: number, capacity?: boolean) => Promise<SkeletonResult>;
	/** the engine filled this COLUMN to its goal (see heuristics/columnFills) */
	columnFills: (page: number, col: number | undefined) => boolean;
	/** per-break pruned runs from the last compile (junction truth for the certified hop) */
	seams: () => SeamEntry[];
	/** a right-to-left page paints from the raster only: no hop may land on it */
	pageIsRtl: (p: number) => boolean;
	/** the box the engine built a column in, found by the window that owns its records */
	colBox: (page: number, colL: number, colR: number) => PageColumn | undefined;
	followEdit: (page: number, top: number, bottom: number, colL?: number, colR?: number) => void;
	emit: (kind: string, detail?: unknown) => void;
};

export class DraftPatcher {
	private patching = false;
	private patchingSince = 0;
	// the run that owns the patch flag: a stuck-patch takeover starts a new one, and the
	// abandoned run must not paint or release the flag behind its successor
	private patchRun = 0;
	private queuedPatch: PatchReq | null = null;
	// an EXACT patch already produced the page's records, so its trailing pass has nothing to
	// discover -- the timer only exists to flush the lazy save at the typing pause
	private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingSave: (() => void | Promise<void>) | null = null;
	private pendingReason: string | null = null;
	// a certified hop paints TWO pages; when its source page renders again without one, the
	// receiver still shows carried lines a patch no longer clips away -- track and clear
	private hopSource: number | null = null;
	private hopTarget: number | null = null;
	// geometry located once per paragraph per compile; keystrokes reuse it
	private calCache = new Map<string, Cal | CalBail>();
	// where each block's galley starts, also once per compile. It cannot ride calCache: that
	// one is keyed by the NARROWED line, so answering needs this first. Reading the stamps
	// scans every page's records, which on a 900-page document is not a per-keystroke cost.
	private bandStartCache = new Map<string, number>();
	// bumped when a compile replaces the pages: a patch spanning that landing was built
	// against replaced geometry and must not paint
	private geometryEpoch = 0;
	// a structural edit (new/split/deleted paragraph) has no patch to follow -- the editor
	// registers the paragraph that diverged; after the recompile we locate and highlight it
	private pendingFocus: { file: string; line: number; endLine: number; text: string; listItem?: boolean } | null = null;
	constructor(private hooks: PatcherHooks) {}

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
		this.bandStartCache.clear();
	}

	/** compile finished: run any edit that arrived mid-compile */
	afterCompile(): void {
		this.hopSource = null;
		this.hopTarget = null;
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
		const r = this.pendingSave;
		this.pendingSave = null;
		this.pendingReason = null;
		await r?.();
		return true;
	}

	// the same block starting where the engine's stamps say its galley does, or null when that
	// is where it already starts. Both text sides move together: the splice replaces exactly
	// the range the band covers, so a narrowed band with the full text would overwrite lines
	// that are no longer part of it.
	private narrow(req: PatchReq): PatchReq | null {
		const endLine = req.endLine ?? req.line;
		const k = `${req.file}:${req.line}:${endLine}`;
		let start = this.bandStartCache.get(k);
		if (start === undefined) {
			start = this.hooks.bandStart(req.file, req.line, endLine);
			this.bandStartCache.set(k, start);
		}
		if (start <= req.line) return null;
		const drop = start - req.line;
		const cut = (s: string) => s.split('\n').slice(drop).join('\n');
		const orig = cut(req.orig);
		if (!orig.trim()) return null;
		return { ...req, line: start, orig, text: cut(req.text) };
	}

	// Only an EXACT patch reaches here, so the pass has nothing left to discover and stays
	// quiet; the timer exists to flush the lazy save at the typing pause. compile=false when
	// the patch also produced the page's records, which leaves nothing at all to run.
	private scheduleReconcile(onRecompile: (() => void | Promise<void>) | undefined, compile = true, why = 'baseline'): void {
		this.schedulePause(onRecompile, compile ? 'quiet:' + why : null);
	}

	// ONE debounced slot for the typing pause: the LATEST save wins, and the compile reason
	// is STICKY -- an interior edit that owes the document a pass must not have it downgraded
	// by a later adopted keystroke that owes nothing, and five refused keystrokes must cost
	// one pass, not five racing each other's supersede.
	private schedulePause(onRecompile: (() => void | Promise<void>) | undefined, reason: string | null): void {
		this.pendingSave = onRecompile ?? null;
		if (reason) this.pendingReason = reason;
		if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
		this.reconcileTimer = setTimeout(async () => {
			this.reconcileTimer = null;
			const save = this.pendingSave;
			const why = this.pendingReason;
			this.pendingSave = null;
			this.pendingReason = null;
			await save?.();
			if (why) this.hooks.compile(why);
		}, 700);
	}

	// An abandon runs its own pass and saves on the way; a timer armed by an earlier keystroke
	// would fire a second one behind it, against a baseline this edit has already moved past.
	// (Declining to ARM one was never enough -- nothing cancelled the one already ticking.)
	private cancelReconcile(): void {
		if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
		this.reconcileTimer = null;
		this.pendingSave = null;
		this.pendingReason = null;
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
			// the block's leading source lines may produce no galley of their own, and the daemon
			// reproducing the block as a paragraph counts them in. Both sides move together or the
			// splice would replace text the band no longer covers. Inside the try: this owns the
			h.emit('patch-start', {
				file: req.file,
				line: req.line,
				origLen: req.orig.length,
				textLen: req.text.length,
				origHead: req.orig.slice(0, 50)
			});
			let key = `${req.file}:${req.line}`;
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
				// An APPROX answer on a block whose leading source lines produced no galley of
				// their own: \centerline{...} makes a plain \hbox, so the page has one row fewer
				// than the daemon reproducing the block as a paragraph does, and every row below
				// renders a baseline high. Retry on the band the engine's stamps name.
				//
				// A RECOVERY, never a precondition. The stamps cannot tell that case from a
				// run-in heading whose text really does open the first galley line (\paragraph,
				// \subsubsection), whose stamp also points past the heading's own line -- so this
				// only runs where the ordinary answer was already inexact, and is kept only when
				// it locates EXACTLY. Narrowing those blocks up front cut real text out of the
				// band and cost four rows their render (measured on bert: content-mismatch).
				const narrowed = 'bail' in cal ? null : cal.approx ? this.narrow(req) : null;
				if (narrowed) {
					const retry = await h.locate(narrowed.file, narrowed.line, narrowed.orig, narrowed.listItem, narrowed.endLine);
					if (!('bail' in retry) && !retry.approx) {
						h.emit('band-narrowed', { from: req.line, to: narrowed.line, endLine: req.endLine });
						req = narrowed;
						cal = retry;
						key = `${req.file}:${req.line}`;
					}
				}
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
					this.scheduleReconcile(req.onRecompile, true, cal.bail);
					return;
				}
				await abandonToCompile(h, req, cal.bail, { key }, (reason) => this.schedulePause(req.onRecompile, reason));
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
				await abandonToCompile(h, req, 'typeset', { ok: r.ok }, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
				return;
			}
			const lineRecs = r.records.filter((x: any) => x.t === 'line');
			if (!lineRecs.length) {
				await abandonToCompile(h, req, 'no-lines', undefined, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
				return;
			}
			// An interior edit (text inside unchanged structure) renders only when the ENGINE's
			// output says the edit is content: typeset the OLD block too and compare. A band
			// that did not change means the text was consumed as a value (\gdef\ver{2.0} ->
			// {3.0}, an index term) and its only effect is elsewhere -- the pass is the only
			// honest render. One extra daemon round trip, paid only on this tier.
			if (req.interiorEdit) {
				const orig = await h.daemonTypeset({
					text: (cal.pre ?? '') + (cal.indent && !req.listItem ? INDENT_PREFIX : '') + req.orig,
					hsize: cal.W
				});
				if (!orig.ok || !bandChanged(orig.records as any[], r.records as any[])) {
					this.cancelReconcile();
					await abandonToCompile(h, req, 'value-changed', { key }, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
					return;
				}
			}
			const { h1, dk } = lineExtents(lineRecs);
			if (cal.spill) {
				// The paragraph straddles a column or page break. The chain planners that used to
				// re-derive the flow hop by hop are gone: their EXACT claims graded 13.6% wrong
				// (92 of 678 rows), because every hop's landing was JS assembly around engine
				// answers rather than an engine answer. A straddle recompiles -- with the warm
				// engine that costs ~650ms, not the wrong page it used to risk.
				this.cancelReconcile();
				const stage = cal.spill.pageNo !== undefined && cal.spill.pageNo !== cal.pageNo ? 'spans-pages' : 'spans-columns';
				await abandonToCompile(h, req, stage, { key }, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
				return;
			}
			const colBottom = h.colBottomOf(cal.pageNo);
			const floorA = h.contentFloor(cal.pageNo);
			const flow = computeReflow(cal, r.records, lineRecs, { dk, colBottom, floorA, pageRecords: h.pageRecords });
			// Footnote body text lives at the page bottom, outside the patch band: any
			// footnote-bearing paragraph reconciles. Asked of the ENGINE, from `note` records
			// (walker emits one per \insert), not of the source: the regex this replaced was
			// unanchored, so \footnotesize refused a page carrying no note at all. The PAGE
			// side catches a REMOVED note, and is the honest condition anyway -- pageSkeleton
			// cannot model inserts, so no page carrying one is certifiable however it got
			// there. (A char-code signature comparison used to license EXACT body patches --
			// deleted: whether the page-bottom note block still matches is the engine's call.)
			const footnote = (r.records as any[]).some((x: any) => x.t === 'note') || h.pageRecords(cal.pageNo).some((x: any) => x.t === 'note');
			const fontGap = await h.missingInk(r.records as any[]);
			// Engine page-break certificate: two skeleton splits on the warm daemon --
			// calibrate on the unedited column, then re-split with the edited band spliced in.
			// Break held -> the certified baselines respace band and column to the engine's
			// own numbers, so stretch-approx locates and underflow stop demoting. Break moved,
			// or any refusal -> the edit takes the full pass.
			const facts = { stretchy: h.pageStretchy(cal.pageNo), footnote, fontGap, delta: flow.delta, underflow: flow.underflow };
			const ciA = columnIndexOf(h.pageRecords(cal.pageNo), cal.W, cal.colL);
			let cert: Certificate | null = certifiable(cal, req, facts)
				? await pageBreakCertificate(
						{ pageRecords: h.pageRecords, splitSkeleton: h.splitSkeleton, emit: h.emit },
						cal,
						r.records as any[],
						colBottom,
						h.paper().topSkip
					)
				: null;
			// A shrink whose break the certificate says moved BACKWARD has content arriving from
			// the next column, which only a full pass can place -- the pull chain that used to
			// assemble it is gone with the rest of the chain machinery.
			if (cert && cert.shrunk) cert = null;
			// full certificate (same line count) carries the engine's baselines; a fit-only
			// certificate (grown band) just answers whether the page still holds the content
			const fullCert = cert?.fits && cert.bandAbsYs ? (cert as FullCertificate) : null;
			const certRecs = fullCert ? remapBandRecords(r.records as any[], fullCert.bandAbsYs, cal.b1 - flow.y0) : null;
			// The region above the band no longer costs a certificate its exactness: the engine
			// respaced the whole column and the patch now carries those rows' own steps, where
			// it used to reduce them to maxAboveDy and refuse. There is no magnitude bound left
			// to apply -- certifiedFlow names a step for every box it moves, so a large
			// displacement is exactly as renderable as a small one, and the old `maxAboveDy`
			// test would only be re-deriving `aboveSteps.length`.
			const certExact = !!fullCert && !!certRecs;
			const stage = whyNotExact({
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
				transient: !!req.transient,
				stretchy: facts.stretchy,
				// the same column reading pageCertificate uses; an unidentified column answers
				// from the page-wide inference, which is the conservative side here
				packed: h.columnFills(cal.pageNo, ciA > 0 ? ciA - 1 : undefined),
				grew: flow.delta !== 0
			});
			// A certified HOP before any overflow abandon: when the engine's capacity split
			// names whole paragraphs leaving this column, and the receiver calibrates and
			// absorbs them, the flow renders from engine answers end to end -- and still
			// reconciles behind itself like the interior tier, so nothing painted can outlive
			// a mistake. Any refusal falls through to the ordinary abandon.
			if ((stage === 'overflow' || stage === 'engine-overflow') && !req.transient) {
				let hopMoved = cert?.moved ?? null;
				if (!hopMoved && !cert) {
					// certifiable() gates the SAME-page certificate on stretchy pages; the hop
					// needs only the capacity split's motion, which a ragged page answers too
					const hc = await pageBreakCertificate(
						{ pageRecords: h.pageRecords, splitSkeleton: h.splitSkeleton, emit: h.emit },
						cal,
						r.records as any[],
						colBottom,
						h.paper().topSkip
					);
					hopMoved = hc?.moved ?? null;
				}
				if (hopMoved) {
					const plan = await planHop(
						{
							pageRecords: h.pageRecords,
							splitSkeleton: h.splitSkeleton,
							seams: h.seams,
							colBottomOf: h.colBottomOf,
							contentFloor: h.contentFloor,
							columnFills: h.columnFills,
							pageIsRtl: h.pageIsRtl,
							pageCount: h.pageCount,
							paper: h.paper,
							emit: h.emit
						},
						cal,
						hopMoved,
						r.records as any[],
						{ y0: flow.y0, h1, dk, floorA }
					);
					if (plan && !stale()) {
						if (this.hopTarget !== null && this.hopTarget !== plan.pageB) await h.clearPatch(this.hopTarget);
						await h.applyPatch(cal.pageNo, plan.patchA);
						await h.applyPatch(plan.pageB, plan.patchB);
						this.hopSource = cal.pageNo;
						this.hopTarget = plan.pageB;
						// the edited LINE's highlight, same as the exact path: the band always stays
						// on the source page (breakMotion refuses breaks inside it), so the focus
						// reads the remapped band records like any certified render
						const hopWhole = {
							page: cal.pageNo,
							top: plan.patchA.top,
							bottom: hopMoved.bandAbsYs[hopMoved.bandAbsYs.length - 1] + dk,
							colL: cal.colL,
							colR: cal.colR
						};
						const hopFocus = editFocus(req.orig, req.text, plan.patchA.newRecs as any[], lineRecs, [{ ...hopWhole, from: 0 }], hopWhole, {
							h1,
							dk
						});
						showFocus(h, hopFocus);
						const hopMs = performance.now() - t0;
						h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: hopMs.toFixed(0) }));
						h.emit('patched-split', { hop: 1, page: cal.pageNo, spillPage: plan.pageB, carried: hopMoved.movedBases.length });
						// never adopts; the pass behind it repaints whatever a hop cannot speak for
						this.scheduleReconcile(req.onRecompile, true, 'hop');
						return;
					}
				}
			}
			// Nothing unproven reaches the screen. This used to paint first and tint after,
			// which put a render the reconcile had to fix in front of the user on two thirds
			// of the rows that took it -- the page it replaced was closer to the truth.
			if (stage) {
				this.cancelReconcile();
				await abandonToCompile(
					h,
					req,
					stage,
					{ page: cal.pageNo, delta: +flow.delta.toFixed(1), col: certCol(h, cal, colBottom) },
					(reason) => this.schedulePause(req.onRecompile, reason)
				);
				return;
			}
			const patchObj = buildBandPatch(cal, (certRecs ?? r.records) as any[], {
				y0: flow.y0,
				h1,
				dk,
				delta: flow.delta,
				floorA,
				stretchy: h.pageStretchy(cal.pageNo),
				pageRecords: h.pageRecords,
				cert: certRecs && fullCert ? { steps: fullCert.steps, aboveSteps: fullCert.aboveSteps } : undefined
			});
			if (stale()) return;
			await h.applyPatch(cal.pageNo, patchObj); // survives zoom re-renders until the next compile
			if (this.hopTarget !== null && this.hopSource === cal.pageNo) {
				const t = this.hopTarget;
				this.hopSource = null;
				this.hopTarget = null;
				await h.clearPatch(t);
			}
			// the edited LINE, not the paragraph: a highlight over twenty lines says nothing
			// about where the words are landing, and the scroll it drives centres the
			// paragraph's start rather than the cursor
			const whole = { page: cal.pageNo, top: patchObj.top, bottom: cal.bk + dk + Math.max(0, flow.delta), colL: cal.colL, colR: cal.colR };
			const focus = editFocus(req.orig, req.text, (certRecs ?? r.records) as any[], lineRecs, [{ ...whole, from: 0 }], whole, { h1, dk });
			showFocus(h, focus); // zoom+center on the edited line (Typst-style)
			const ms = performance.now() - t0;
			h.emit('patched', { page: cal.pageNo, delta: +flow.delta.toFixed(1), ms: +ms.toFixed(0) });
			h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: ms.toFixed(0) }));
			// An exact patch IS the engine's answer -- band records from the daemon, the
			// column's own respace from the certificate -- so the pass that used to follow
			// it only regenerated numbers already in hand. Where the page's new records can
			// be derived from the same pieces the painter drew, derive them and move the
			// baseline here; the recompile then has nothing left to discover and is skipped.
			// (It re-baselines either way: without it the FIRST edit in any other paragraph
			// reads as two pending edits and takes a visible full pass.)
			// A source line ADDED or REMOVED shifts the stamps of every paragraph after it,
			// on every page -- more than this page's records can answer for, so that case
			// keeps the pass. Typing inside a line (the common edit) changes no line count.
			const sameLines = req.orig.split('\n').length === req.text.split('\n').length;
			// adoption itself invalidates the located-geometry caches when it moved anything:
			// the store is the writer, so the invariant lives in adoptPatchedRecords
			const adopted =
				sameLines &&
				!req.interiorEdit &&
				h.adoptPatchedRecords(cal.pageNo, patchObj, bandStampOf(h.pageRecords(cal.pageNo), cal.b1, cal.bk));
			if (adopted) req.onBaseline?.();
			this.scheduleReconcile(req.onRecompile, !adopted);
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

// Diagnostic only: whether the edited column has material the certificate's skeleton cannot
// see. `pinned` = its galley stops short of the column box, which is a float placed at the
// foot -- the case where capacity and the layout target stop being the same number.
function bandOf(cal: Cal): { page: number; top: number; bottom: number; colL: number; colR: number } {
	return { page: cal.pageNo, top: cal.b1 - 10, bottom: cal.bk + 4, colL: cal.colL, colR: cal.colR };
}

function certCol(h: PatcherHooks, cal: Cal, colBottom: number): Record<string, unknown> | undefined {
	const box = h.colBox(cal.pageNo, cal.colL, cal.colR);
	if (!box) return undefined;
	const pls = (h.pageRecords(cal.pageNo) as any[]).filter(
		(r) => r.t === 'pl' && r.x >= cal.colL && r.x <= cal.colR && r.h !== undefined && r.c !== undefined
	);
	if (!pls.length) return { top: +box.top.toFixed(1), bottom: +box.bottom.toFixed(1), gord: box.gord };
	const first = pls.reduce((a, b) => (a.y < b.y ? a : b));
	const last = pls.reduce((a, b) => (a.y > b.y ? a : b));
	const foot = last.y + (last.d ?? 0);
	return {
		top: +box.top.toFixed(1),
		bottom: +box.bottom.toFixed(1),
		gord: box.gord,
		galleyTop: +(first.y - first.h).toFixed(1),
		lastBase: +last.y.toFixed(1),
		above: +(first.y - first.h - box.top).toFixed(1),
		below: +(box.bottom - foot).toFixed(1),
		pinned: box.bottom - foot > 0.5,
		colBottom: +colBottom.toFixed(1)
	};
}
