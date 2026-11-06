// Engines parked at the base, ready for a teleport or a compile. A process serves once, so the pool spawns the next
// as soon as one is taken. A spare is only as good as what it read before the base: the main file's preamble, the
// seed files and the project files the preamble loaded.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { DraftEngine } from './draftEngine';

// each parked lualatex holds 100 to 300 MB
const SPARES = 2;
const IDLE_STOP_MS = 10 * 60 * 1000;

type Spare = { engine: DraftEngine; key: string; stamp: Promise<string | null>; fonts?: string };
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
let config: PoolConfig | null = null;
let idleTimer: NodeJS.Timeout | null = null;

/** a main file's text up to and including its \begin{document} line */
export function preambleOfText(src: string): string | null {
	const m = /^.*\\begin\{document\}.*$/m.exec(src);
	return m ? src.slice(0, m.index + m[0].length) : null;
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

function spawnSpare(c: PoolConfig): void {
	// the engine reads the preamble from disk, so that is what it holds
	const preamble = diskPreamble(c.root, c.mainRel);
	if (preamble === null) return;
	const engine = new DraftEngine(c.root, c.mainRel, c.engineDir, c.seedDir, c.engine);
	const spare: Spare = { engine, key: keyOf(c, preamble), stamp: engine.ready.then((files) => (files ? stampOf(c.root, files) : null)) };
	preload(spare, c);
	spares.push(spare);
	void engine.exited.then(() => {
		if (spares.includes(spare)) {
			spares = spares.filter((s) => s !== spare);
			engine.remove();
		}
	});
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
	if (diskPreamble(c.root, c.mainRel) === c.preamble) while (spares.length < SPARES) spawnSpare(c);
	armIdleStop();
}

/**
 * An engine at the base for this configuration: a current spare, else a fresh one that reads the preamble first.
 * The pool refills either way.
 */
export async function takeEngine(c: PoolConfig): Promise<DraftEngine> {
	const key = keyOf(c, c.preamble);
	let taken: DraftEngine | null = null;
	for (const s of [...spares]) {
		if (taken || s.key !== key || s.engine.dead) continue;
		spares = spares.filter((x) => x !== s);
		const files = await s.engine.ready;
		const stamp = await s.stamp;
		if (files && stamp === (c.preStamp ?? stampOf(c.root, files))) taken = s.engine;
		else s.engine.remove();
	}
	warmPool(c);
	return taken ?? new DraftEngine(c.root, c.mainRel, c.engineDir, c.seedDir, c.engine);
}

export function poolConfig(): PoolConfig | null {
	return config;
}

export function stopPool(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = null;
	for (const s of spares) s.engine.remove();
	spares = [];
	config = null;
}
