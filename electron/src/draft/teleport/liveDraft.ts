// The open folder's live preview: the index edits teleport from, one teleport at a time, and the engine folders
// the index still reads.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OUT } from '../compileJob';
import { readPage, type DraftPage } from '../draftProducts';
import { linesOf, lineEdit } from './lineEdit';
import { readIndexFile, type PointIndex } from './pointIndex';
import { planLua } from './planLua';
import { takeEngine, warmPool, diskPreamble, preambleOfText, stampOf, type PoolConfig } from './enginePool';
import { engineFolders, type DraftEngine } from './draftEngine';

export type TeleportRequest = { file: string; text: string };
export type TeleportResult =
	| {
			ok: true;
			ms: number;
			// pages from `from` on came from this run; past `stop` they are the ones already shown
			from?: number;
			stop?: number;
			// the lines the edit added or removed move the source lines on the pages past `stop`: a line record
			// whose file id is `sf` and whose line is past `after` moves by `by`
			shift?: { sf: number; after: number; by: number };
			count: number;
			srcFiles: string[];
	  }
	// preamble: the edit changes what every run reads before the base, so only a compile shows it
	| { ok: false; reason: 'no-index' | 'preamble' | 'outside' | 'refused' | 'failed' | 'superseded'; detail?: string; ms: number };

type Queued = { req: TeleportRequest; onPage: (p: DraftPage) => void; done: (r: TeleportResult) => void };

function norm(p: string): string {
	return p.replace(/\\/g, '/');
}
let overrideSeq = 0;

export class LiveDraft {
	#running: DraftEngine | null = null;
	#queued: Queued | null = null;
	#closed = false;

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

	close(): void {
		this.#closed = true;
		this.#running?.kill();
		this.#queued?.done({ ok: false, reason: 'superseded', ms: 0 });
		this.#queued = null;
	}

	/** one teleport at a time; a request arriving meanwhile waits, and a newer one replaces it */
	teleport(req: TeleportRequest, onPage: (p: DraftPage) => void): Promise<TeleportResult> {
		return new Promise((done) => {
			if (this.#running) {
				this.#queued?.done({ ok: false, reason: 'superseded', ms: 0 });
				this.#queued = { req, onPage, done };
				return;
			}
			void this.#run(req, onPage).then(done);
		});
	}

	async #run(req: TeleportRequest, onPage: (p: DraftPage) => void): Promise<TeleportResult> {
		const t0 = Date.now();
		const result = await this.#runOnce(req, onPage, t0).catch((e: unknown): TeleportResult => ({
			ok: false,
			reason: 'failed',
			detail: e instanceof Error ? e.message : String(e),
			ms: Date.now() - t0
		}));
		this.#running = null;
		if (!this.#closed) this.#collectGarbage();
		const next = this.#queued;
		this.#queued = null;
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
			fontList: this.index.fontList
		};
	}

	async #runOnce(req: TeleportRequest, onPage: (p: DraftPage) => void, t0: number): Promise<TeleportResult> {
		function ms(): number {
			return Date.now() - t0;
		}
		const file = norm(req.file);
		const old = this.index.text(file);
		if (old === null) return { ok: false, reason: 'outside', ms: ms() };
		const edit = lineEdit(linesOf(old), linesOf(req.text));
		if (!edit) return { ok: true, ms: ms(), stop: 0, count: this.count, srcFiles: this.srcFiles };
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
		const plan = this.index.planFor(file, edit);
		if (!plan) return { ok: false, reason: 'outside', ms: ms() };

		const engine = await takeEngine(pool);
		if (this.#closed) {
			engine.remove();
			return { ok: false, reason: 'superseded', ms: ms() };
		}
		this.#running = engine;
		if (!(await engine.ready)) {
			engine.remove();
			return { ok: false, reason: 'failed', detail: 'the engine stopped in the preamble', ms: ms() };
		}

		// every file reads as the index holds it, whatever disk has by now; the edited one as the edit left it
		const overDir = path.join(engine.abs, 'over');
		fs.mkdirSync(overDir, { recursive: true });
		const edited = path.join(overDir, `${++overrideSeq}.tex`);
		fs.writeFileSync(edited, req.text);
		const overrides = new Map<string, string>();
		for (const [rel, snap] of this.index.basis) overrides.set(rel, norm(path.relative(this.root, snap)));
		overrides.set(file, norm(path.relative(this.root, edited)));
		const planRel = `${engine.rel}/plan.lua`;
		fs.writeFileSync(path.join(this.root, planRel), planLua(plan, overrides, file, edit));

		// pages read in order, each as soon as the engine reports it
		let pages = Promise.resolve();
		const outcome = await engine.teleport(planRel, (p) => {
			pages = pages.then(async () => {
				const page = await readPage(engine.abs, this.root, p.n, p.w, p.h, p.unc);
				if (!this.#closed) onPage(page);
			});
		});
		await pages;
		if (this.#closed) return { ok: false, reason: 'superseded', ms: ms() };
		if (outcome.refused) return { ok: false, reason: 'refused', detail: outcome.refused, ms: ms() };
		// a run to the end exits like any LaTeX run, with an error count; only a run that never applied failed
		if (outcome.applyMs === undefined) return { ok: false, reason: 'failed', detail: `engine exit ${outcome.code}`, ms: ms() };

		let manifest: { count?: number; srcFiles?: string[] } = {};
		try {
			manifest = JSON.parse(fs.readFileSync(path.join(engine.abs, 'pages.json'), 'utf8'));
		} catch {
			/* no page shipped: the count and file table stand */
		}
		this.index.merge(plan, file, edit, readIndexFile(path.join(engine.abs, 'tele', 'index.jsonl')), outcome.stop?.rec ?? null);
		this.index.adoptBasis(engine.abs);
		if (manifest.srcFiles) this.srcFiles = manifest.srcFiles;
		if (!outcome.stop && manifest.count !== undefined) this.count = manifest.count;
		const by = edit.newTo - edit.oldTo;
		// page-extract names a file by its lowercased base name
		const sf = this.srcFiles.indexOf(path.basename(file).toLowerCase()) + 1;
		return {
			ok: true,
			ms: ms(),
			...(outcome.pages.length ? { from: outcome.pages[0].n } : {}),
			...(outcome.stop ? { stop: outcome.stop.shipped } : {}),
			...(outcome.stop && by && sf ? { shift: { sf, after: edit.oldTo, by } } : {}),
			count: this.count,
			srcFiles: this.srcFiles
		};
	}

	#collectGarbage(): void {
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
