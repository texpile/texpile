/* eslint-disable @typescript-eslint/no-explicit-any */
// The instant-patch lifecycle: re-typeset one edited paragraph on the warm daemon and splice
// it into its page -- ONLY when provably identical to a full recompile; else nothing is
// painted and the full pass runs. Two outcomes, no middle: the tinted "close enough" tier
// that used to sit between them graded 62-66% wrong against the reconcile, so it was showing
// the wrong page more often than the right one and calling it a render.
import { INDENT_PREFIX } from './daemonIndent';
import { abandonToCompile } from './patch/abandonToCompile';
import { showFocus } from './patch/showFocus';
import { bandChanged } from './heuristics/eligibility/bandChanged';
import { editFocus } from './heuristics/editFocus';
import { cachedProof, findBand, paragraphOf, planPatch, proofKey, proveOn, storeProof } from './column/planPatch';
import type { BandProof, ProofRefusal } from './column/bandProof';
import { paraPrefix, type ParaParams } from './column/paraPrefix';
import { whyPhrase } from './whyPhrase';
import type { Cal, CalBail, PaperMetrics } from './locate/locate.types';
import { patchInk, type Patch, type PatchReq } from './patch/patch.types';
import type { SeamEntry } from './patch/seam.types';
import type { EditBand } from './draftViewport.svelte';
import type { SkeletonItem, SkeletonMode, SkeletonResult } from '$lib/workspace/fileSystem';
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
	paper: () => PaperMetrics;
	missingInk: (records: any[]) => Promise<boolean>;
	/** record the live patch and paint it (activePatch.set + renderPage + patchedPages.add) */
	applyPatch: (n: number, p: Patch | Patch[]) => Promise<void>;
	/** drop a page's live patch and repaint it from records */
	clearPatch: (n: number) => Promise<void>;
	/** install the records this patch produced, so the store describes what is on screen; returns them, or
	 *  null when it declined and the caller must fall back to the recompile */
	adoptPatchedRecords: (n: number, p: Patch) => any[] | null;
	showEditBand: (b: EditBand, holdMs?: number) => void;
	synctex: (body: Record<string, unknown>) => Promise<any>;
	pdfPath: () => string;
	/** ask the warm engine to break or pack a column list */
	splitSkeleton: (items: SkeletonItem[], targetPt: number, mode: SkeletonMode) => Promise<SkeletonResult>;
	/** per-break discarded runs from the last compile: what followed each galley */
	seams: () => SeamEntry[];
	/** a right-to-left page paints from the raster only: no carried line may land on it */
	pageIsRtl: (p: number) => boolean;
	/** a paragraph's parameters at its line break, by the serial its lines carry */
	paraParams: (pi: number) => ParaParams | undefined;
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
		this.drainQueued();
	}

	// the held edit is decided again, not replayed: the patch or compile it waited behind can have moved the
	// baseline its `orig` was diffed against, and an `orig` the page no longer shows locates nowhere, so fast
	// typing fell to a full recompile where slow typing patched
	private drainQueued(): void {
		const q = this.queuedPatch;
		this.queuedPatch = null;
		if (!q) return;
		if (q.redecide) q.redecide();
		else void this.instantPatch(q);
	}

	/** savePdf: run a pending debounced save now; its pass is dropped, the save runs its own */
	async flushReconcile(): Promise<void> {
		if (!this.reconcileTimer) return;
		clearTimeout(this.reconcileTimer);
		this.reconcileTimer = null;
		const r = this.pendingSave;
		this.pendingSave = null;
		this.pendingReason = null;
		await r?.();
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
		function cut(s: string) {
			return s.split('\n').slice(drop).join('\n');
		}
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

	async instantPatch(asked: PatchReq): Promise<void> {
		let req = asked;
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
			// the locate matched glyphs other than the page's (a counter's digits, lines broken elsewhere), a
			// transient render carries invented closers, and a changed command set can mean anything
			const flagged =
				(cal.approx && !cal.approxStretch && 'approx-locate') ||
				(req.floatInner && !req.floatTabular && 'float-inner') ||
				(req.cmdChanged && 'command-changed') ||
				(req.transient && 'transient');
			if (flagged) {
				this.cancelReconcile();
				await abandonToCompile(h, req, flagged, { page: cal.pageNo }, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
				return;
			}
			const recs = h.pageRecords(cal.pageNo);
			const band = findBand(recs, cal, !!req.floatInner);
			if ('refused' in band) {
				this.cancelReconcile();
				await abandonToCompile(
					h,
					req,
					'list:' + band.refused,
					{ page: cal.pageNo },
					(reason) => this.schedulePause(req.onRecompile, reason),
					bandOf(cal)
				);
				return;
			}
			// The paragraph's own parameters, as the compile recorded them at its line break: its font, its
			// indent, its penalties (\clubpenalty 10000 under a heading), its line-breaking and spacing. Without a
			// record the document's defaults stand, the locate's measured font with them, and the band proof
			// decides the indent. An edit that changes the paragraph's command set (e.g. typing \noindent) is
			// cmdChanged and always reconciles -- the engine certifies whatever the commands mean.
			const params = paragraphOf(recs, band, h.paraParams);
			// The ways this block could have opened on the page, the band proof picks the one it did:
			//   the paragraph's recorded parameters, or without a record the document's defaults and the locate's
			//   measured font, indented as the locate read it
			//   the same the other way round for the indent, which one line cannot show until its box is compared
			//   an environment in vertical mode (LaTeX adds \partopsep above it there) at its column's own width,
			//   setting its own paragraphs' parameters
			const base = params ? paraPrefix(params) : (cal.pre ?? '');
			const indented = !!cal.indent && !req.listItem;
			const openings: { lead: string; hsize: number }[] = [{ lead: base + (!params && indented ? INDENT_PREFIX : ''), hsize: cal.W }];
			if (!params) openings.push({ lead: base + (indented ? '' : INDENT_PREFIX), hsize: cal.W });
			if (/^\s*\\begin\{/.test(req.text) && /^\s*\\begin\{/.test(req.orig) && band.column)
				openings.push({ lead: '\\par', hsize: band.column.w });
			let opening = openings[Math.min(cal.opening ?? 0, openings.length - 1)];
			function typesetAs(text: string, o = opening) {
				return h.daemonTypeset({ text: o.lead + text, hsize: o.hsize });
			}
			let r = await typesetAs(req.text);
			if (!r.ok || (r.stats && (r.stats as any).certified === false)) {
				await abandonToCompile(h, req, 'typeset', { ok: r.ok }, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
				return;
			}
			if (!r.records.some((x: any) => x.t === 'line')) {
				await abandonToCompile(h, req, 'no-lines', undefined, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
				return;
			}
			// An interior edit (text inside unchanged structure) renders only when the ENGINE's
			// output says the edit is content: typeset the OLD block too and compare. A band
			// that did not change means the text was consumed as a value (\gdef\ver{2.0} ->
			// {3.0}, an index term) and its only effect is elsewhere -- the pass is the only
			// honest render. One extra daemon round trip, paid only on this tier.
			function typesetOrig() {
				return typesetAs(req.orig);
			}
			let origTypeset: Awaited<ReturnType<typeof typesetOrig>> | null = null;
			if (req.interiorEdit) {
				origTypeset = await typesetOrig();
				if (!origTypeset.ok || !bandChanged(origTypeset.records as any[], r.records as any[])) {
					this.cancelReconcile();
					await abandonToCompile(h, req, 'value-changed', { key }, (reason) => this.schedulePause(req.onRecompile, reason), bandOf(cal));
					return;
				}
			}
			if (await h.missingInk(r.records as any[])) {
				this.cancelReconcile();
				await abandonToCompile(
					h,
					req,
					'font-missing',
					{ page: cal.pageNo },
					(reason) => this.schedulePause(req.onRecompile, reason),
					bandOf(cal)
				);
				return;
			}
			// the band must be the daemon's typeset of the old text, glyph for glyph and item for item
			const pk = proofKey(band, req.orig);
			let proof = cachedProof(recs, pk);
			if (proof === undefined) {
				origTypeset ??= await typesetOrig();
				let found: BandProof | ProofRefusal = origTypeset.ok ? proveOn(recs, band, origTypeset.records as any[]) : { refused: 'typeset' };
				for (let k = 0; 'refused' in found && cal.opening === undefined && k < openings.length; k++) {
					if (openings[k] === opening) continue;
					const tried = await typesetAs(req.orig, openings[k]);
					const other: BandProof | ProofRefusal = tried.ok ? proveOn(recs, band, tried.records as any[]) : found;
					if ('refused' in other) h.emit('opening-refused', { opening: k, why: other.refused, ...other.detail });
					else {
						cal.opening = k;
						opening = openings[k];
						h.emit('opening-proved', { opening: k });
						found = other;
						r = await typesetAs(req.text);
						if (!r.ok || (r.stats && (r.stats as any).certified === false)) found = { refused: 'typeset' };
					}
				}
				proof = found;
				storeProof(recs, pk, proof);
			}
			if ('refused' in proof) {
				this.cancelReconcile();
				await abandonToCompile(
					h,
					req,
					'not-the-typeset',
					{ page: cal.pageNo, why: proof.refused, ...proof.detail },
					(reason) => this.schedulePause(req.onRecompile, reason),
					bandOf(cal)
				);
				return;
			}
			const plan = await planPatch(
				{
					pageRecords: h.pageRecords,
					pageCount: h.pageCount,
					seams: h.seams,
					split: h.splitSkeleton,
					topSkip: () => h.paper().topSkip,
					pageIsRtl: h.pageIsRtl
				},
				cal.pageNo,
				band,
				proof,
				r.records as any[]
			);
			if ('hop' in plan) {
				if (stale()) return;
				const [a, b] = plan.hop;
				if (this.hopTarget !== null && this.hopTarget !== b.page) await h.clearPatch(this.hopTarget);
				await h.applyPatch(a.page, a.patch);
				await h.applyPatch(b.page, b.patch);
				this.hopSource = a.page;
				this.hopTarget = b.page;
				const whole = { page: a.page, ...a.patch.band };
				showFocus(h, whole);
				const ms = performance.now() - t0;
				h.setStatus(m.draft_status_patched({ page: a.page, ms: ms.toFixed(0) }));
				h.emit('patched-split', { hop: 1, page: a.page, spillPage: b.page });
				// both pages are the engine's, but the break moved: the compile behind it brings the record
				// store, the seams and every later page up to date, where two patches cannot
				this.scheduleReconcile(req.onRecompile, true, 'hop');
				return;
			}
			if (!('patch' in plan)) {
				this.cancelReconcile();
				const stage = 'moved' in plan ? 'break-moved' : plan.stage;
				const detail = 'moved' in plan ? plan.moved : plan.detail;
				await abandonToCompile(
					h,
					req,
					stage,
					{ page: cal.pageNo, ...detail },
					(reason) => this.schedulePause(req.onRecompile, reason),
					bandOf(cal)
				);
				return;
			}
			const patchObj = plan.patch;
			if (plan.certified) h.emit('skel-certified', { page: cal.pageNo });
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
			const whole = { page: cal.pageNo, ...patchObj.band };
			const ink = patchInk(patchObj) as any[];
			const placedLines = ink.filter((x) => x.t === 'pl');
			const focus = editFocus(req.orig, req.text, ink, placedLines, [{ ...whole, top: 0, from: 0 }], whole, {
				h1: 0,
				dk: 0
			});
			showFocus(h, focus); // zoom+center on the edited line (Typst-style)
			const ms = performance.now() - t0;
			h.emit('patched', { page: cal.pageNo, moves: patchObj.moves.length, ms: +ms.toFixed(0) });
			h.setStatus(m.draft_status_patched({ page: cal.pageNo, ms: ms.toFixed(0) }));
			// An exact patch IS the engine's answer, so the pass that used to follow it only
			// regenerated numbers already in hand: the page's new records come from the same
			// pieces the painter drew, and the recompile has nothing left to discover.
			// A source line ADDED or REMOVED shifts the stamps of every paragraph after it,
			// on every page -- more than this page's records can answer for, so that case
			// keeps the pass. Typing inside a line (the common edit) changes no line count.
			const sameLines = req.orig.split('\n').length === req.text.split('\n').length;
			// the paint above awaited: a compile landing meanwhile holds records this patch must not overwrite
			if (stale()) return;
			const adopted = sameLines && !req.interiorEdit ? h.adoptPatchedRecords(cal.pageNo, patchObj) : null;
			if (adopted) {
				// the adopted band IS the daemon's typeset of the new text, so the next keystroke's proof is in hand
				storeProof(adopted, proofKey({ ...band, to: band.from + plan.bandLen - 1 }, req.text), proof);
				req.onBaseline?.();
			}
			this.scheduleReconcile(req.onRecompile, !adopted);
		} catch (e) {
			h.emit('error', String(e));
			// instant path is best-effort; the debounced full recompile always follows
		} finally {
			// only the owning run releases the flag: a run a takeover abandoned would
			// otherwise unlock (and start draining the queue) under its live successor
			if (this.patchRun === run) {
				this.patching = false;
				this.drainQueued();
			}
		}
	}
}

function bandOf(cal: Cal): { page: number; top: number; bottom: number; colL: number; colR: number } {
	return { page: cal.pageNo, top: cal.b1 - 10, bottom: cal.bk + 4, colL: cal.colL, colR: cal.colR };
}
