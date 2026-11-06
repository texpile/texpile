// Engines parked at the base, ready for a teleport or a compile. A teleport hands its engine back, which then parks
// at the base again; the pool spawns a new one only when an engine exits. A spare is only as good as what it read
// before the base: the main file's preamble, the seed files and the project files the preamble loaded.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { DraftEngine } from './draftEngine';

// each parked lualatex holds 100 to 300 MB; the count takes in the ones serving
const ENGINES = 2;
const IDLE_STOP_MS = 10 * 60 * 1000;

// at: resolves once the engine waits at the base, false when it exited first
type Spare = { engine: DraftEngine; key: string; stamp: Promise<string | null>; at: Promise<boolean>; fonts?: string };
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
};

let spares: Spare[] = [];
// taken and not handed back yet, with the key and stamp they were taken under
const out = new Map<DraftEngine, Spare>();
let config: PoolConfig | null = null;
let idleTimer: NodeJS.Timeout | null = null;

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

// a spare that died goes; a taken engine's folder is its taker's to remove
function watchExit(s: Spare): void {
	void s.engine.exited.then(() => {
		const spare = spares.includes(s);
		spares = spares.filter((x) => x !== s);
		if (out.get(s.engine) === s) out.delete(s.engine);
		if (spare) retire(s.engine);
		if (config) warmPool(config);
	});
}

function spawnSpare(c: PoolConfig): void {
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
	spares.push(spare);
	watchExit(spare);
}

// stdin holds the command until the engine reaches the base
function preload(s: Spare, c: PoolConfig): void {
	if (!c.fontList || s.fonts === c.fontList) return;
	s.engine.preloadFonts(c.fontList);
	// eslint-disable-next-line no-param-reassign -- the spare records what it was sent
	s.fonts = c.fontList;
}

function armIdleStop(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => stopPool(), IDLE_STOP_MS);
	idleTimer.unref?.();
}

/** keeps SPARES engines warming for this configuration, dropping any warmed for another */
export function warmPool(c: PoolConfig): void {
	config = c;
	const key = keyOf(c, c.preamble);
	for (const s of spares.filter((x) => x.key !== key)) {
		spares = spares.filter((x) => x !== s);
		s.engine.remove();
	}
	for (const s of spares) preload(s, c);
	// disk moved on from what the configuration expects: a spare would hold the wrong base
	if (diskPreamble(c.root, c.mainRel) === c.preamble) while (spares.length + out.size < ENGINES) spawnSpare(c);
	armIdleStop();
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

/**
 * An engine at the base for this configuration: the first spare there, else a fresh one that reads the preamble.
 * `unserved` is for a compile, whose PDF must hold its own pages alone
 */
export async function takeEngine(c: PoolConfig, unserved = false): Promise<DraftEngine> {
	const key = keyOf(c, c.preamble);
	for (;;) {
		const s = await firstAtBase(spares.filter((x) => x.key === key && !x.engine.dead && !(unserved && x.engine.serves)));
		if (!s) break;
		if (!spares.includes(s)) continue;
		spares = spares.filter((x) => x !== s);
		const files = await s.engine.ready;
		if (files && (await s.stamp) === (c.preStamp ?? stampOf(c.root, files))) {
			out.set(s.engine, s);
			warmPool(c);
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
	out.set(engine, s);
	watchExit(s);
	warmPool(c);
	return engine;
}

/** a teleport is done with its engine: it serves again once it parks, if the pool still wants its base */
export function giveBack(engine: DraftEngine): void {
	const s = out.get(engine);
	// it exited as its run ended
	if (!s) {
		retire(engine);
		return;
	}
	out.delete(engine);
	if (!config || s.key !== keyOf(config, config.preamble)) {
		retire(engine);
		if (config) warmPool(config);
		return;
	}
	const back: Spare = { ...s, at: engine.parked, fonts: undefined };
	spares.unshift(back);
	preload(back, config);
	watchExit(back);
}

export function poolConfig(): PoolConfig | null {
	return config;
}

export function stopPool(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = null;
	config = null;
	for (const s of [...spares, ...out.values()]) s.engine.remove();
	spares = [];
	out.clear();
}
