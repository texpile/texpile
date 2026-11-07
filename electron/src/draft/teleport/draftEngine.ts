// One lualatex in its own folder under _draft. It reads the preamble and waits at the base, then either compiles
// the whole document (GO) or teleports to a plan's point and typesets on from there (TELE), after which it goes back
// to the base for the next teleport. Staged (PRE), it applies a plan's chain ahead of the edit and waits there.
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import readline from 'node:readline';
import { engineJob, mirrorSourceFolders, writeHooksFile, OUT } from '../compileJob';

export type EnginePage = { n: number; w: number; h: number; unc?: string };
export type TeleportOutcome = {
	applyMs?: number;
	// when each step of the apply finished, for profiling
	applyStages?: string;
	// the run met an old point in the same state: pages after `shipped` are the old ones
	stop?: { shipped: number; rec: string };
	// the run ended where it was asked to
	cut?: boolean;
	refused?: string;
	pages: EnginePage[];
	code: number | null;
};

let seq = 0;
/** folders of engines still running, which nothing may sweep */
export const engineFolders = new Set<string>();

/** copies a folder's files over another, keeping subfolders (an \include's chapter .aux) */
export function copyTree(from: string, to: string): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(from, { withFileTypes: true });
	} catch {
		return;
	}
	fs.mkdirSync(to, { recursive: true });
	for (const e of entries) {
		const a = path.join(from, e.name);
		const b = path.join(to, e.name);
		if (e.isDirectory()) copyTree(a, b);
		else fs.copyFileSync(a, b);
	}
}

export class DraftEngine {
	/** the engine's folder, relative to the compile root (TeX writes only below the root) */
	readonly rel: string;
	readonly abs: string;
	/** the project files read before the base; null when the process died before it */
	readonly ready: Promise<string[] | null>;
	readonly exited: Promise<number | null>;
	dead = false;
	/** the format's LaTeX version, when it is older than live mode needs; the process then exits before the base */
	oldLatex: string | null = null;
	/** teleports served, which also numbers each serve's files */
	serves = 0;
	/** after a teleport: true once the process waits at its base again, false when it exited instead */
	parked: Promise<boolean> = Promise.resolve(false);
	#child: ChildProcess;
	#listener: ((kind: string, rest: string) => void) | null = null;
	// each command that ends at the base (TELE, DROP) waits for its PARKED in turn: a stage can be sent while the
	// process still winds down from its last run
	#parkWaiters: ((ok: boolean) => void)[] = [];
	// the serve a stage opened, whose files the edit's run goes on with
	#stagedServe: number | null = null;

	constructor(
		readonly root: string,
		mainRel: string,
		engineDir: string,
		seedDir: string | null,
		engine = 'lualatex'
	) {
		this.rel = `${OUT}/p${Date.now().toString(36)}${++seq}`;
		this.abs = path.join(root, this.rel);
		engineFolders.add(path.basename(this.rel));
		fs.mkdirSync(path.join(this.abs, 'tele'), { recursive: true });
		mirrorSourceFolders(root, this.abs);
		if (seedDir) {
			copyTree(seedDir, this.abs);
			copyTree(seedDir, path.join(this.abs, 'tele', 'seed'));
		}
		writeHooksFile(this.abs);
		this.#child = spawn(
			engine,
			[
				'-no-shell-escape',
				'-interaction=nonstopmode',
				'-synctex=1',
				`-output-directory=${this.rel}`,
				'-jobname=draft',
				engineJob(engineDir, this.rel, mainRel, true)
			],
			// every step of a reset and an apply prints the next, and TeX keeps each printed level until the chain
			// unwinds: a served run's chain goes past the default 15
			{ cwd: root, windowsHide: true, env: { ...process.env, max_print_line: '100000', max_in_open: '64' } }
		);
		// a process that died in the preamble closes its stdin under the next GO
		this.#child.stdin?.on('error', () => undefined);
		this.exited = new Promise((resolve) => {
			this.#child.on('exit', (code) => {
				this.dead = true;
				engineFolders.delete(path.basename(this.rel));
				resolve(code);
			});
			this.#child.on('error', () => {
				this.dead = true;
				engineFolders.delete(path.basename(this.rel));
				resolve(null);
			});
		});
		const settle: { ready?: (files: string[] | null) => void } = {};
		this.ready = new Promise((resolve) => (settle.ready = resolve));
		void this.exited.then(() => settle.ready?.(null));
		readline.createInterface({ input: this.#child.stdout! }).on('line', (line) => {
			const m = /^@@TELE (\w+) ?(.*)$/.exec(line);
			if (!m) return;
			if (m[1] === 'READY') {
				let files: string[] = [];
				try {
					files = JSON.parse(m[2] || '[]');
				} catch {
					/* names it could not quote: the folder's mtimes still cover the preamble */
				}
				settle.ready?.(files);
			} else if (m[1] === 'OLDLATEX') this.oldLatex = m[2];
			else if (m[1] === 'PARKED') this.#parkWaiters.shift()?.(true);
			else this.#listener?.(m[1], m[2]);
		});
		void this.exited.then(() => {
			for (const w of this.#parkWaiters.splice(0)) w(false);
		});
		this.#child.stdout!.resume();
	}

	/** loads the fonts a list names while it waits at the base (the list a recording wrote, root-relative) */
	preloadFonts(listRel: string): void {
		this.#child.stdin?.write(`FONTS ${listRel}\n`);
	}

	preloadImages(listRel: string): void {
		this.#child.stdin?.write(`IMAGES ${listRel}\n`);
	}

	/** compiles the whole document from the base, recording points as it goes */
	go(): Promise<number | null> {
		this.#child.stdin?.write('GO\n');
		return this.exited;
	}

	/** `planRel` is the plan file, relative to the root; each page is reported as it ships. The outcome is in once the
	 * run is over; the process then goes back to its base on its own (`parked`) */
	teleport(planRel: string, onPage: (p: EnginePage) => void): Promise<TeleportOutcome> {
		const out: TeleportOutcome = { pages: [], code: null };
		this.parked = this.#waitForPark();
		return new Promise((resolve) => {
			this.#listener = (kind, rest) => {
				if (kind === 'APPLIED') {
					const sp = rest.indexOf(' ');
					out.applyMs = Number(sp < 0 ? rest : rest.slice(0, sp));
					if (sp >= 0) out.applyStages = rest.slice(sp + 1);
				} else if (kind === 'PAGE') {
					const [n, w, h, unc] = rest.split(' ');
					const p: EnginePage = { n: Number(n), w: Number(w), h: Number(h), ...(unc ? { unc } : {}) };
					out.pages.push(p);
					onPage(p);
				} else if (kind === 'STOP') {
					const sp = rest.indexOf(' ');
					out.stop = { shipped: Number(rest.slice(0, sp)), rec: rest.slice(sp + 1) };
					resolve(out);
				} else if (kind === 'CUT' || kind === 'END') {
					if (kind === 'CUT') out.cut = true;
					resolve(out);
				} else if (kind === 'REFUSED') out.refused = rest;
			};
			this.#child.stdin?.write(`TELE ${planRel}\n`);
			void this.exited.then((code) => resolve({ ...out, code }));
		});
	}

	#waitForPark(): Promise<boolean> {
		if (this.dead) return Promise.resolve(false);
		return new Promise((resolve) => this.#parkWaiters.push(resolve));
	}

	/** applies the chain of the plan at `planRel`, for serve `serve`, and waits at its last point: the next teleport
	 * goes on from there */
	stage(planRel: string, serve: number): void {
		this.#stagedServe = serve;
		this.#child.stdin?.write(`PRE ${planRel}\n`);
	}

	/** the serve a stage opened, once: the run that goes on from it writes its files there */
	takeStagedServe(): number | null {
		const n = this.#stagedServe;
		this.#stagedServe = null;
		return n;
	}

	/** a staged process goes back to its base unused */
	drop(): void {
		this.#stagedServe = null;
		this.parked = this.#waitForPark();
		this.#child.stdin?.write('DROP\n');
	}

	/** the number of the serve about to start */
	nextServe(): number {
		return ++this.serves;
	}

	/** the run under way ends at its next clean point, where the process parks */
	cut(cutRel: string): void {
		fs.writeFileSync(path.join(this.root, cutRel), '');
	}

	kill(): void {
		try {
			this.#child.kill('SIGKILL');
		} catch {
			/* already gone */
		}
	}

	/** the folder goes once nothing reads from it */
	remove(): void {
		this.kill();
		void this.exited.then(() => fs.rmSync(this.abs, { recursive: true, force: true }));
	}
}
