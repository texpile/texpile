// One lualatex in its own folder under _draft. It reads the preamble and waits at the base, then either compiles
// the whole document (GO) or teleports to a plan's point and typesets on from there (TELE), after which it goes back
// to the edited paragraph's first line when it kept that point, else to the base. Staged (PRE), it applies a plan's
// chain ahead of the edit and waits there.
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import readline from 'node:readline';
import { engineJob, mirrorSourceFolders, writeHooksFile, OUT } from '../compileJob';

export type EnginePage = { n: number; w: number; h: number; unc?: string; records: string };
export type TeleportOutcome = {
	applyMs?: number;
	// when each step of the apply finished, for profiling
	applyStages?: string;
	// the run met an old point in the same state: pages after `shipped` are the old ones
	stop?: { shipped: number; rec: string };
	// the run ended where it was asked to
	cut?: boolean;
	// the run read the document to its end
	ended?: boolean;
	refused?: string;
	pages: EnginePage[];
	code: number | null;
};

let seq = 0;
// gets every report an engine makes but its pages, and TeX's errors; the live gates count the points that did not
// come back
let follow: ((engine: string, kind: string, rest: string) => void) | null = null;
export function followEngines(to: typeof follow): void {
	follow = to;
}
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
	/** after a teleport: true once the process waits again, at its base or at `stagedAt`; false when it exited instead */
	parked: Promise<boolean> = Promise.resolve(false);
	// the record of the point the process last said it waits at: a stage's, or the one it went back to after its run
	#at: string | null = null;
	#child: ChildProcess;
	#listener: ((kind: string, rest: string) => void) | null = null;
	// each command that ends at the base (TELE, DROP) waits for its PARKED in turn: a stage can be sent while the
	// process still winds down from its last run
	#parkWaiters: ((ok: boolean) => void)[] = [];
	// the serve a stage opened, whose files the edit's run goes on with
	#stagedServe: number | null = null;
	// ends the teleport under way for its caller, as cut
	#release: (() => void) | null = null;
	// a released run still reports until it parks: none of that is the next teleport's
	#muted = false;
	// told once where a stage that read on to its paragraph waits
	#onAt: ((rec: string) => void) | null = null;

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
		// a served page's record lines follow its PAGE line
		let page: { head: string; left: number; lines: string[] } | null = null;
		readline.createInterface({ input: this.#child.stdout! }).on('line', (line) => {
			if (page) {
				page.lines.push(line);
				if (--page.left > 0) return;
				if (!this.#muted) this.#listener?.('PAGE', `${page.head}\n${page.lines.join('\n')}`);
				page = null;
				return;
			}
			const m = /^@@TELE (\w+) ?(.*)$/.exec(line);
			if (!m) {
				if (line.startsWith('! ')) follow?.(path.basename(this.rel), 'TEX', line);
				return;
			}
			if (m[1] !== 'PAGE') follow?.(path.basename(this.rel), m[1], m[2]);
			if (m[1] === 'READY') {
				let files: string[] = [];
				try {
					files = JSON.parse(m[2] || '[]');
				} catch {
					/* names it could not quote: the folder's mtimes still cover the preamble */
				}
				settle.ready?.(files);
			} else if (m[1] === 'OLDLATEX') this.oldLatex = m[2];
			else if (m[1] === 'AT') {
				this.#at = m[2];
				const told = this.#onAt;
				this.#onAt = null;
				told?.(m[2]);
			} else if (m[1] === 'PARKED' || m[1] === 'STAGED') {
				this.#at = m[1] === 'STAGED' ? m[2].split(' ')[0] : null;
				this.#muted = false;
				this.#parkWaiters.shift()?.(true);
			} else if (m[1] === 'PAGE' && Number(m[2].split(' ')[3]) > 0) page = { head: m[2], left: Number(m[2].split(' ')[3]), lines: [] };
			else if (!this.#muted) this.#listener?.(m[1], m[2]);
		});
		void this.exited.then(() => {
			for (const w of this.#parkWaiters.splice(0)) w(false);
		});
		this.#child.stdout!.resume();
	}

	/** the record of the point the process waits at, ready for an edit; null at the base or on its way */
	get waitingAt(): string | null {
		return this.#parkWaiters.length ? null : this.#at;
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

	/** `plan` is the plan's Lua source (`planLua`); each page is reported as it ships, and `onEdit` once the page the
	 * edit ends on is out. The outcome is in once the run is over; the process then waits again on its own (`parked`) */
	teleport(plan: string, onPage: (p: EnginePage) => void, onEdit?: () => void): Promise<TeleportOutcome> {
		const out: TeleportOutcome = { pages: [], code: null };
		this.#at = null;
		this.#onAt = null;
		this.parked = this.#waitForPark();
		return new Promise((resolve) => {
			this.#release = () => {
				this.#listener = null;
				this.#release = null;
				this.#muted = true;
				resolve({ ...out, cut: true });
			};
			this.#listener = (kind, rest) => {
				if (kind === 'EDIT') onEdit?.();
				if (kind === 'APPLIED') {
					const sp = rest.indexOf(' ');
					out.applyMs = Number(sp < 0 ? rest : rest.slice(0, sp));
					if (sp >= 0) out.applyStages = rest.slice(sp + 1);
				} else if (kind === 'PAGE') {
					const nl = rest.indexOf('\n');
					const [n, w, h, , unc] = (nl < 0 ? rest : rest.slice(0, nl)).split(' ');
					const records = nl < 0 ? '' : rest.slice(nl + 1);
					const p: EnginePage = { n: Number(n), w: Number(w), h: Number(h), ...(unc ? { unc } : {}), records };
					out.pages.push(p);
					onPage(p);
				} else if (kind === 'STOP') {
					const sp = rest.indexOf(' ');
					out.stop = { shipped: Number(rest.slice(0, sp)), rec: rest.slice(sp + 1) };
					this.#release = null;
					resolve(out);
				} else if (kind === 'CUT' || kind === 'END') {
					if (kind === 'CUT') out.cut = true;
					else out.ended = true;
					this.#release = null;
					resolve(out);
				} else if (kind === 'REFUSED') out.refused = rest;
			};
			this.#child.stdin?.write(`TELE ${plan}\n`);
			void this.exited.then((code) => resolve({ ...out, code }));
		});
	}

	#waitForPark(): Promise<boolean> {
		if (this.dead) return Promise.resolve(false);
		return new Promise((resolve) => this.#parkWaiters.push(resolve));
	}

	/** applies the chain of `plan`, for serve `serve`, reads on to the paragraph the plan stages at and waits at the
	 * point there: the next teleport goes on from it. `onAt` gets that point's record */
	stage(plan: string, serve: number, onAt?: (rec: string) => void): void {
		this.#at = null;
		this.#onAt = onAt ?? null;
		this.#stagedServe = serve;
		this.#child.stdin?.write(`PRE ${plan}\n`);
	}

	/** the serve a stage opened, once: the run that goes on from it writes its files there */
	takeStagedServe(): number | null {
		const n = this.#stagedServe;
		this.#stagedServe = null;
		return n;
	}

	/** a staged process goes back to its base unused */
	drop(): void {
		this.#at = null;
		this.#onAt = null;
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

	/** the cut run's caller goes on now: what the run still reports is dropped */
	release(): void {
		this.#release?.();
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
