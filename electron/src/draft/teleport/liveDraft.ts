// The open folder's live preview: the index edits teleport from, one teleport at a time, and the engine folders
// the index still reads.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OUT } from '../compileJob';
import { pageOfRecords, type DraftPage } from '../draftProducts';
import { linesOf, lineEdit, lineShifts, type LineEdit, type LineShift } from './lineEdit';
import { readIndexFile, type PointIndex, type TeleportPlan } from './pointIndex';
import { planLua, type PlanOverride } from './planLua';
import { paragraphOpen, paragraphStart } from './heldEdit';
import {
	takeEngine,
	takeStaged,
	stageEngine,
	giveBack,
	warmPool,
	diskPreamble,
	preambleOfText,
	stampOf,
	type PoolConfig
} from './enginePool';
import { engineFolders, type DraftEngine } from './draftEngine';
import { sweepHeld } from './sweepHold';

export type TeleportRequest = { file: string; text: string };
export type SourceShift = { sf: number; after: number; by: number };
export type TeleportResult =
	| {
			ok: true;
			ms: number;
			// pages from `from` on came from this run; past `stop` they are the ones already shown
			from?: number;
			stop?: number;
			// the lines the edit added or removed move the source lines on the pages past `stop`: a line record
			// whose file id is `sf` and whose line is past `after` moves by `by`, one shift after the other
			shifts?: SourceShift[];
			count: number;
			srcFiles: string[];
	  }
	// preamble: the edit changes what every run reads before the base, so only a compile shows it; held: the
	// edit leaves its paragraph open, and the next keystroke decides; replaced: a compile's index took over first
	| {
			ok: false;
			reason: 'no-index' | 'preamble' | 'outside' | 'held' | 'refused' | 'failed' | 'superseded' | 'replaced';
			detail?: string;
			ms: number;
			// a cut run's pages stay on screen, and the pages past `stop` take its source lines
			stop?: number;
			shifts?: SourceShift[];
	  };

type Queued = { req: TeleportRequest; onPage: (p: DraftPage) => void; done: (r: TeleportResult) => void };

function norm(p: string): string {
	return p.replace(/\\/g, '/');
}

// what a staged engine went through to its point: the chain, and every file but the edited one as it read them
function stageKey(plan: TeleportPlan, basis: Map<string, string>, file: string): string {
	return JSON.stringify([plan.chain, [...basis].filter(([rel]) => rel !== file).sort()]);
}
// a run that ships no page this long is in a loop: the compile shows the text instead
const STALL_MS = 10000;
// a cut unanswered this long: the run is busy inside one line, and the newer edit takes over
const CUT_MS = 2000;

export class LiveDraft {
	// a teleport is under way, from its plan to its merge; the engine only once it has one
	#busy = false;
	#running: DraftEngine | null = null;
	// the newest waiting edit of each file, in the order they came: an older one of the same file is in its diff
	#queued = new Map<string, Queued>();
	// a newer edit of the running teleport's file holds this one in its diff: the engine ends the run once its first
	// page is out
	#cut: { file: string; now: () => void } | null = null;
	#closed = false;
	#closedAs: 'superseded' | 'replaced' = 'superseded';
	// pages cut runs left on screen with their text, until a run ships them again; texts: what the source lines on
	// the pages past them follow, for each file a cut run edited
	#reship: { from: number; to: number; texts: Map<string, string> } | null = null;

	constructor(
		readonly root: string,
		readonly mainRel: string,
		readonly engineDir: string,
		readonly index: PointIndex,
		public count: number,
		public srcFiles: string[]
	) {
		const pool = this.#pool();
		if (pool) warmPool(pool);
		this.#collectGarbage();
	}

	/** replaced: a compile's index takes over, and the edits waiting or running here are the app's to send again */
	close(replaced = false): void {
		this.#closed = true;
		if (replaced) this.#closedAs = 'replaced';
		this.#running?.kill();
		for (const q of this.#queued.values()) q.done({ ok: false, reason: this.#closedAs, ms: 0 });
		this.#queued.clear();
	}

	/** one teleport at a time; a request arriving meanwhile waits, and a newer one replaces it */
	teleport(req: TeleportRequest, onPage: (p: DraftPage) => void): Promise<TeleportResult> {
		return new Promise((done) => {
			if (this.#busy) {
				const file = norm(req.file);
				this.#queued.get(file)?.done({ ok: false, reason: 'superseded', ms: 0 });
				this.#queued.delete(file);
				this.#queued.set(file, { req, onPage, done });
				// what is left of the run only looks for where to stop; the newer text matters more, unless it waits for the
				// next keystroke and would leave the cut run's pages on screen
				if (this.#cut?.file === file && !this.#holds(req)) this.#cut.now();
				return;
			}
			void this.#run(req, onPage).then(done);
		});
	}

	#holds(req: TeleportRequest): boolean {
		const old = this.index.text(norm(req.file));
		if (old === null) return false;
		const before = linesOf(old);
		const after = linesOf(req.text);
		const edit = lineEdit(before, after);
		return !!edit && paragraphOpen(before, after, edit);
	}

	async #run(req: TeleportRequest, onPage: (p: DraftPage) => void): Promise<TeleportResult> {
		this.#busy = true;
		const t0 = Date.now();
		let result = await this.#runOnce(req, onPage, t0).catch((e: unknown): TeleportResult => ({
			ok: false,
			reason: 'failed',
			detail: e instanceof Error ? e.message : String(e),
			ms: Date.now() - t0
		}));
		if (!result.ok && this.#closedAs === 'replaced') result = { ok: false, reason: 'replaced', ms: result.ms };
		this.#running = null;
		this.#busy = false;
		if (!this.#closed) this.#collectGarbage();
		// the newest first: it is the one on screen, and the others wait for one run instead of it waiting for theirs
		const [file, next] = [...this.#queued.entries()].at(-1) ?? [];
		if (file !== undefined) this.#queued.delete(file);
		if (next && !this.#closed) void this.#run(next.req, next.onPage).then(next.done);
		return result;
	}

	/** engines for teleports must hold the base the index was recorded against */
	#pool(): PoolConfig | null {
		const main = this.index.text(this.mainRel);
		const preamble = main === null ? null : preambleOfText(main);
		if (preamble === null) return null;
		return {
			root: this.root,
			mainRel: this.mainRel,
			engineDir: this.engineDir,
			engine: 'lualatex',
			seedDir: this.index.seedDir,
			preamble,
			preStamp: this.index.preStamp,
			fontList: this.index.fontList,
			imageList: this.index.imageList
		};
	}

	async #runOnce(req: TeleportRequest, onPage: (p: DraftPage) => void, t0: number): Promise<TeleportResult> {
		function ms(): number {
			return Date.now() - t0;
		}
		const file = norm(req.file);
		const old = this.index.text(file);
		if (old === null) return { ok: false, reason: 'outside', ms: ms() };
		const lines = linesOf(req.text);
		const oldLines = linesOf(old);
		const edit = lineEdit(oldLines, lines);
		// the text went back to what the index holds, and a cut run's pages show the one in between
		if (!edit && this.#reship) return { ok: false, reason: 'refused', detail: 'a cut run left its pages', ms: ms() };
		if (!edit) return { ok: true, ms: ms(), stop: 0, count: this.count, srcFiles: this.srcFiles };
		if (paragraphOpen(oldLines, lines, edit)) return { ok: false, reason: 'held', ms: ms() };
		const pool = this.#pool();
		// what every engine reads before the base moved on from what the points were recorded against
		if (
			!pool ||
			(file === this.mainRel && edit.from <= this.index.bodyLine) ||
			this.index.preFiles.includes(file) ||
			diskPreamble(this.root, this.mainRel) !== pool.preamble ||
			stampOf(this.root, this.index.preFiles) !== this.index.preStamp
		)
			return { ok: false, reason: 'preamble', ms: ms() };
		const plan = this.index.planFor(file, edit, this.#reship ?? undefined);
		if (!plan) return { ok: false, reason: 'outside', ms: ms() };

		// typing goes on in one paragraph, so the edit before this one staged a spare at the same chain
		const key = plan.chain.length ? stageKey(plan, this.index.basis, file) : null;
		const engine = (key && takeStaged(pool, key)) || (await takeEngine(pool));
		if (this.#closed) {
			engine.remove();
			return { ok: false, reason: 'superseded', ms: ms() };
		}
		this.#running = engine;
		if (!(await engine.ready)) {
			engine.remove();
			return { ok: false, reason: 'failed', detail: 'the engine stopped in the preamble', ms: ms() };
		}
		const result = await this.#serve(engine, req, onPage, { file, lines, oldLines, edit, plan, pool, key }, ms);
		if (this.#closed) engine.remove();
		else giveBack(engine);
		return result;
	}

	async #serve(
		engine: DraftEngine,
		req: TeleportRequest,
		onPage: (p: DraftPage) => void,
		at: { file: string; lines: string[]; oldLines: string[]; edit: LineEdit; plan: TeleportPlan; pool: PoolConfig; key: string | null },
		ms: () => number
	): Promise<TeleportResult> {
		const { file, lines, oldLines, edit, plan, pool, key } = at;
		// every file reads as the index holds it, whatever disk has by now; the edited one as the edit left it
		const overrides = new Map<string, PlanOverride>();
		for (const [rel, snap] of this.index.basis) overrides.set(rel, norm(path.relative(this.root, snap)));
		overrides.set(file, { text: req.text });
		// each serve of an engine has its own files: the index reads the snapshots of earlier ones; a staged engine goes
		// on with the serve its stage opened
		const planText = (to: DraftEngine, n: number): string => {
			const serve = { src: `${to.rel}/tele/s${n}`, cut: `${to.rel}/tele/cut-${n}` };
			return planLua(plan, overrides, file, edit, paragraphStart(lines, edit), this.srcFiles, serve, this.index.imageList);
		};
		const n = engine.takeStagedServe() ?? engine.nextServe();
		const serve = { src: `${engine.rel}/tele/s${n}`, cut: `${engine.rel}/tele/cut-${n}` };

		let killed: 'stalled' | 'cut' | null = null;
		let watch: ReturnType<typeof setTimeout> | undefined;
		function killAfter(why: 'stalled' | 'cut', after: number): void {
			clearTimeout(watch);
			watch = setTimeout(() => {
				killed = why;
				engine.kill();
			}, after);
		}
		killAfter('stalled', STALL_MS);
		let cutAsked = false;
		let paged = false;
		this.#cut = {
			file,
			now: () => {
				if (cutAsked) return;
				cutAsked = true;
				engine.cut(serve.cut);
				if (paged) killAfter('cut', CUT_MS);
			}
		};
		const waiting = this.#queued.get(file);
		if (waiting && !this.#holds(waiting.req)) this.#cut.now();
		// pages read in order, each as soon as the engine reports it
		let pages = Promise.resolve();
		const shipped: number[] = [];
		const running = engine.teleport(planText(engine, n), (p) => {
			shipped.push(p.n);
			pages = pages.then(async () => {
				const page = await pageOfRecords(p.records, this.root, p.n, p.w, p.h, p.unc);
				if (!this.#closed) onPage(page);
			});
			if (cutAsked && !paged) killAfter('cut', CUT_MS);
			else if (!cutAsked) killAfter('stalled', STALL_MS);
			paged = true;
		});
		if (key)
			stageEngine(pool, key, (other) => {
				const m = other.nextServe();
				return { plan: planText(other, m), serve: m };
			});
		const outcome = await running;
		clearTimeout(watch);
		this.#cut = null;
		await pages;
		// the pages a cut run shipped show its text, which the next run's diff may not hold
		let cutMoved: { stop?: number; shifts?: SourceShift[] } = {};
		if ((killed === 'cut' || outcome.cut) && shipped.length) {
			const from = Math.min(...shipped, this.#reship?.from ?? Infinity);
			const texts = this.#reship?.texts ?? new Map<string, string>();
			const was = texts.get(file);
			const shifts = this.#sourceShifts(file, lineShifts(was === undefined ? oldLines : linesOf(was), lines));
			texts.set(file, req.text);
			this.#reship = { from, to: Math.max(...shipped, this.#reship?.to ?? 0), texts };
			if (shifts.length) cutMoved = { stop: Math.max(...shipped), shifts };
		}
		if (killed === 'cut') return { ok: false, reason: 'superseded', ms: ms(), ...cutMoved };
		if (killed) return { ok: false, reason: 'failed', detail: `no page for ${STALL_MS / 1000} s`, ms: ms() };
		if (outcome.cut) {
			this.index.keepBefore(plan, file, edit, readIndexFile(path.join(engine.abs, 'tele', 'index.jsonl')));
			return { ok: false, reason: 'superseded', ms: ms(), ...cutMoved };
		}
		if (this.#closed) return { ok: false, reason: 'superseded', ms: ms() };
		if (outcome.refused) return { ok: false, reason: 'refused', detail: outcome.refused, ms: ms() };
		// only a run that never applied failed
		if (outcome.applyMs === undefined) return { ok: false, reason: 'failed', detail: `engine exit ${outcome.code}`, ms: ms() };
		// a fatal error ended the job: its pages.json is an earlier serve's
		if (!outcome.stop && !outcome.ended)
			return { ok: false, reason: 'failed', detail: `engine exit ${outcome.code} after the apply`, ms: ms() };

		let manifest: { count?: number; srcFiles?: string[] } = {};
		try {
			manifest = JSON.parse(fs.readFileSync(path.join(engine.abs, 'pages.json'), 'utf8'));
		} catch {
			/* no page shipped: the count and file table stand */
		}
		const shifts = lineShifts(oldLines, lines);
		this.index.merge(plan, file, edit, shifts, readIndexFile(path.join(engine.abs, 'tele', 'index.jsonl')), outcome.stop?.rec ?? null);
		const cutTexts = this.#reship?.texts;
		this.#reship = null;
		this.index.adoptBasis(path.join(this.root, serve.src));
		if (manifest.srcFiles && manifest.srcFiles.length >= this.srcFiles.length) this.srcFiles = manifest.srcFiles;
		if (!outcome.stop && manifest.count !== undefined) this.count = manifest.count;
		const moved = this.#screenShifts(file, lines, shifts, cutTexts);
		return {
			ok: true,
			ms: ms(),
			...(outcome.pages.length ? { from: outcome.pages[0].n } : {}),
			...(outcome.stop ? { stop: outcome.stop.shipped } : {}),
			...(outcome.stop && moved.length ? { shifts: moved } : {}),
			count: this.count,
			srcFiles: this.srcFiles
		};
	}

	#sourceShifts(file: string, shifts: LineShift[]): SourceShift[] {
		// page-extract names a file by its lowercased base name
		const sf = this.srcFiles.indexOf(path.basename(file).toLowerCase()) + 1;
		return sf ? shifts.map((s) => ({ sf, ...s })) : [];
	}

	/** past a run's stop the source lines follow the index, or the text a cut run left; they go to what the run read */
	#screenShifts(file: string, lines: string[], shifts: LineShift[], cutTexts?: Map<string, string>): SourceShift[] {
		const own = cutTexts?.get(file);
		const out = this.#sourceShifts(file, own === undefined ? shifts : lineShifts(linesOf(own), lines));
		for (const [f, text] of cutTexts ?? []) {
			const read = f === file ? null : this.index.text(f);
			if (read !== null) out.push(...this.#sourceShifts(f, lineShifts(linesOf(text), linesOf(read))));
		}
		return out;
	}

	#collectGarbage(): void {
		if (sweepHeld(this.root)) return;
		const keep = this.index.folders();
		const outAbs = path.join(this.root, OUT);
		function sweep(p: string): void {
			fs.rm(p, { recursive: true, force: true }, () => undefined);
		}
		const names = fs.existsSync(outAbs) ? fs.readdirSync(outAbs) : [];
		for (const n of names)
			if (/^p[0-9a-z]+$/.test(n) && !keep.has(n) && !engineFolders.has(n) && !fs.existsSync(path.join(this.root, n)))
				sweep(path.join(outAbs, n));
		const seeds = path.join(outAbs, 'seeds');
		for (const n of fs.existsSync(seeds) ? fs.readdirSync(seeds) : [])
			if (path.join(seeds, n) !== this.index.seedDir) sweep(path.join(seeds, n));
	}
}
