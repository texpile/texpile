// Engines parked at the base, ready for a teleport or a compile, one pool per folder. A teleport hands its engine
// back, which then parks at the base again; the pool spawns a new one only when an engine exits. A spare is only as
// good as what it read before the base: the main file's preamble, the seed files and the project files the preamble
// loaded.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { DraftEngine } from './draftEngine';
import { normRoot } from '../../windows/normRoot';

// each parked lualatex holds 100 to 300 MB; the count takes in the ones serving, per folder
const ENGINES = 2;
const IDLE_STOP_MS = 10 * 60 * 1000;
// a served run that reaches no clean point in this long is in a loop
const PARK_MS = 10000;

// at: resolves once the engine waits at the base, false when it exited first; staged: the chain it waits at instead
type Spare = {
	engine: DraftEngine;
	key: string;
	stamp: Promise<string | null>;
	at: Promise<boolean>;
	fonts?: string;
	images?: string;
	staged?: string;
};
export type PoolConfig = {
	root: string;
	mainRel: string;
	engineDir: string;
	engine: string;
	seedDir: string;
	/** what the engine must have read: the preamble and the stamp of the project files it loaded (null: as on disk) */
	preamble: string;
	preStamp: string | null;
	/** fonts for a spare to load while it waits, root-relative */
	fontList?: string;
	/** images for a spare to load while it waits, root-relative */
	imageList?: string;
};

/** a main file's text up to and including its \begin{document} line, with line ends as the engine's reader sees them */
export function preambleOfText(src: string): string | null {
	const text = src.replace(/\r\n?/g, '\n');
	const m = /^.*\\begin\{document\}.*$/m.exec(text);
	return m ? text.slice(0, m.index + m[0].length) : null;
}

export function diskPreamble(root: string, mainRel: string): string | null {
	try {
		return preambleOfText(fs.readFileSync(path.join(root, mainRel), 'utf8'));
	} catch {
		return null;
	}
}

function keyOf(c: PoolConfig, preamble: string): string {
	return crypto.createHash('sha1').update(`${c.mainRel}\0${c.engine}\0${c.seedDir}\0${preamble}`).digest('hex');
}

export function stampOf(root: string, files: string[]): string {
	return files
		.map((f) => {
			try {
				const s = fs.statSync(path.join(root, f));
				return `${f}:${s.size}:${s.mtimeMs}`;
			} catch {
				return `${f}:-`;
			}
		})
		.join('|');
}

// an engine that served holds records the index reads: its folder is left to the live preview's sweep
function retire(e: DraftEngine): void {
	if (e.serves) e.kill();
	else e.remove();
}

// stdin holds the command until the engine reaches the base
function preload(s: Spare, c: PoolConfig): void {
	if (c.fontList && s.fonts !== c.fontList) {
		s.engine.preloadFonts(c.fontList);
		// eslint-disable-next-line no-param-reassign -- the spare records what it was sent
		s.fonts = c.fontList;
	}
	if (c.imageList && s.images !== c.imageList) {
		s.engine.preloadImages(c.imageList);
		// eslint-disable-next-line no-param-reassign
		s.images = c.imageList;
	}
}

// the first of these to reach the base
function firstAtBase(list: Spare[]): Promise<Spare | null> {
	return new Promise((resolve) => {
		let left = list.length;
		if (!left) resolve(null);
		for (const s of list)
			void s.at.then((ok) => {
				if (ok) resolve(s);
				else if (--left === 0) resolve(null);
			});
	});
}

class EnginePool {
	spares: Spare[] = [];
	// taken and not handed back yet, with the key and stamp they were taken under
	out = new Map<DraftEngine, Spare>();
	config: PoolConfig | null = null;
	idleTimer: NodeJS.Timeout | null = null;

	constructor(private readonly onStop: () => void) {}

	// a spare that died goes; a taken engine's folder is its taker's to remove
	watchExit(s: Spare): void {
		void s.engine.exited.then(() => {
			const spare = this.spares.includes(s);
			this.spares = this.spares.filter((x) => x !== s);
			if (this.out.get(s.engine) === s) this.out.delete(s.engine);
			if (spare) retire(s.engine);
			if (this.config) this.warm(this.config);
		});
	}

	spawnSpare(c: PoolConfig): void {
		// the engine reads the preamble from disk, so that is what it holds
		const preamble = diskPreamble(c.root, c.mainRel);
		if (preamble === null) return;
		const engine = new DraftEngine(c.root, c.mainRel, c.engineDir, c.seedDir, c.engine);
		const spare: Spare = {
			engine,
			key: keyOf(c, preamble),
			stamp: engine.ready.then((files) => (files ? stampOf(c.root, files) : null)),
			at: engine.ready.then((files) => files !== null)
		};
		preload(spare, c);
		this.spares.push(spare);
		this.watchExit(spare);
	}

	armIdleStop(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => this.stop(), IDLE_STOP_MS);
		this.idleTimer.unref?.();
	}

	warm(c: PoolConfig): void {
		this.config = c;
		const key = keyOf(c, c.preamble);
		for (const s of this.spares.filter((x) => x.key !== key)) {
			this.spares = this.spares.filter((x) => x !== s);
			s.engine.remove();
		}
		for (const s of this.spares) if (!s.staged) preload(s, c);
		// disk moved on from what the configuration expects: a spare would hold the wrong base
		if (diskPreamble(c.root, c.mainRel) === c.preamble) while (this.spares.length + this.out.size < ENGINES) this.spawnSpare(c);
		this.armIdleStop();
	}

	async take(c: PoolConfig, unserved: boolean): Promise<DraftEngine> {
		const key = keyOf(c, c.preamble);
		for (;;) {
			const fit = this.spares.filter((x) => x.key === key && !x.engine.dead && !(unserved && x.engine.serves));
			// a staged engine waits at a chain: it goes back to the base when no other one will do
			const free = fit.filter((x) => !x.staged);
			if (!free.length && fit.length) this.unstage(fit[0]);
			const s = await firstAtBase(fit.filter((x) => !x.staged));
			if (!s) break;
			if (!this.spares.includes(s)) continue;
			this.spares = this.spares.filter((x) => x !== s);
			const files = await s.engine.ready;
			if (files && (await s.stamp) === (c.preStamp ?? stampOf(c.root, files))) {
				this.out.set(s.engine, s);
				this.warm(c);
				return s.engine;
			}
			retire(s.engine);
		}
		const engine = new DraftEngine(c.root, c.mainRel, c.engineDir, c.seedDir, c.engine);
		const s: Spare = {
			engine,
			key,
			stamp: engine.ready.then((files) => (files ? stampOf(c.root, files) : null)),
			at: Promise.resolve(false)
		};
		this.out.set(engine, s);
		this.watchExit(s);
		this.warm(c);
		return engine;
	}

	unstage(s: Spare): void {
		s.engine.drop();
		// eslint-disable-next-line no-param-reassign -- the spare records where it waits
		s.staged = undefined;
		// eslint-disable-next-line no-param-reassign
		s.at = s.engine.parked;
	}

	/** one spare applies the chain `key` names ahead of the next edit; `write` puts its plan down for a serve */
	stage(c: PoolConfig, key: string, write: (engine: DraftEngine) => { planRel: string; serve: number }): void {
		const fit = this.spares.filter((x) => x.key === keyOf(c, c.preamble) && !x.engine.dead);
		if (fit.some((x) => x.staged === key)) return;
		const s = fit.find((x) => !x.staged) ?? fit[0];
		if (!s) return;
		if (s.staged) this.unstage(s);
		const { planRel, serve } = write(s.engine);
		s.engine.stage(planRel, serve);
		s.staged = key;
	}

	takeStaged(c: PoolConfig, key: string): DraftEngine | null {
		const s = this.spares.find((x) => x.staged === key && x.key === keyOf(c, c.preamble) && !x.engine.dead);
		if (!s) return null;
		this.spares = this.spares.filter((x) => x !== s);
		s.staged = undefined;
		this.out.set(s.engine, s);
		this.warm(c);
		return s.engine;
	}

	giveBack(engine: DraftEngine): void {
		const s = this.out.get(engine);
		// it exited as its run ended
		if (!s) {
			retire(engine);
			return;
		}
		this.out.delete(engine);
		const c = this.config;
		if (!c || s.key !== keyOf(c, c.preamble)) {
			retire(engine);
			if (c) this.warm(c);
			return;
		}
		const back: Spare = { ...s, at: engine.parked, fonts: undefined, images: undefined };
		const late = setTimeout(() => engine.kill(), PARK_MS);
		void engine.parked.then(() => clearTimeout(late));
		this.spares.unshift(back);
		preload(back, c);
		this.watchExit(back);
	}

	stop(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
		this.config = null;
		for (const s of [...this.spares, ...this.out.values()]) s.engine.remove();
		this.spares = [];
		this.out.clear();
		this.onStop();
	}
}

const pools = new Map<string, EnginePool>();
function poolFor(root: string): EnginePool {
	const key = normRoot(root);
	let pool = pools.get(key);
	if (!pool) {
		const made = new EnginePool(() => {
			if (pools.get(key) === made) pools.delete(key);
		});
		pools.set(key, made);
		pool = made;
	}
	return pool;
}

/** keeps ENGINES engines warming at this configuration's base, dropping any warmed for another */
export function warmPool(c: PoolConfig): void {
	poolFor(c.root).warm(c);
}

/**
 * An engine at the base for this configuration: the first spare there, else a fresh one that reads the preamble.
 * `unserved` is for a compile, whose PDF must hold its own pages alone
 */
export function takeEngine(c: PoolConfig, unserved = false): Promise<DraftEngine> {
	return poolFor(c.root).take(c, unserved);
}

/** a spare applies the chain `key` names, ahead of an edit that teleports from it */
export function stageEngine(c: PoolConfig, key: string, write: (engine: DraftEngine) => { planRel: string; serve: number }): void {
	poolFor(c.root).stage(c, key, write);
}

/** the spare staged at `key`, taken; null when none is */
export function takeStaged(c: PoolConfig, key: string): DraftEngine | null {
	return poolFor(c.root).takeStaged(c, key);
}

/** a teleport is done with its engine: it serves again once it parks, if its pool still wants its base */
export function giveBack(engine: DraftEngine): void {
	const pool = pools.get(normRoot(engine.root));
	if (pool) pool.giveBack(engine);
	else retire(engine);
}

/** the folder's engines stop; with no folder, every folder's */
export function stopPool(root?: string): void {
	for (const [key, pool] of [...pools]) if (root === undefined || key === normRoot(root)) pool.stop();
}
