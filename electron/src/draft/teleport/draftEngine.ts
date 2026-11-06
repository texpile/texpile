// One lualatex in its own folder under _draft. It reads the preamble and waits at the base, then either compiles
// the whole document (GO) or teleports to a plan's point and typesets on from there (TELE).
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
	#child: ChildProcess;
	#listener: ((kind: string, rest: string) => void) | null = null;

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
		if (seedDir) copyTree(seedDir, this.abs);
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
			{ cwd: root, windowsHide: true, env: { ...process.env, max_print_line: '100000' } }
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
			} else this.#listener?.(m[1], m[2]);
		});
		this.#child.stdout!.resume();
	}

	/** loads the fonts a list names while it waits at the base (the list a recording wrote, root-relative) */
	preloadFonts(listRel: string): void {
		this.#child.stdin?.write(`FONTS ${listRel}\n`);
	}

	/** compiles the whole document from the base, recording points as it goes */
	go(): Promise<number | null> {
		this.#child.stdin?.write('GO\n');
		return this.exited;
	}

	/** `planRel` is the plan file, relative to the root; each page is reported as it ships */
	teleport(planRel: string, onPage: (p: EnginePage) => void): Promise<TeleportOutcome> {
		const out: TeleportOutcome = { pages: [], code: null };
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
			} else if (kind === 'REFUSED') out.refused = rest;
		};
		this.#child.stdin?.write(`TELE ${planRel}\n`);
		return this.exited.then((code) => ({ ...out, code }));
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
