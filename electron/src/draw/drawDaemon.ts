import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { onToolPathChange } from '../shell/toolDirs';
import { drawJob } from './drawJob';
import { logErrors } from './drawLog';

const DONE = '@@TEXPILE_DRAW_DONE';
const WARM = '@@TEXPILE_DRAW_WARM';
// a picture that runs longer is taken as stuck: the process ends and the next picture starts a new one
const STUCK_MS = 60_000;
// a heavy preamble's first load, with its font database, takes far longer than any picture
const COLD_MS = 300_000;

type Waiting = { resolve: (out: string) => void; reject: (e: Error) => void };

type Daemon = {
	key: string;
	dir: string;
	child: ChildProcessWithoutNullStreams;
	out: string;
	waiting: Waiting | null;
	exited: boolean;
	failure: Error | null;
	warm: boolean;
	onWarm: (() => void) | null;
	queue: Promise<unknown>;
	users: Set<number>;
	used: number;
};

// two papers' figures side by side keep a process each; switching between them costs no restart
const MAX_WARM = 3;
const daemons = new Map<string, Daemon>();

function keyOf(root: string, preamble: string): string {
	return createHash('sha1').update(root).update('\0').update(preamble).digest('hex');
}

function start(root: string, preamble: string, luaDir: string): Daemon {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-draw-'));
	fs.mkdirSync(path.join(dir, 'work'));
	fs.writeFileSync(path.join(dir, 'draw.tex'), drawJob(preamble, luaDir));
	// the document's own files (\input, images, its packages) are found where the paper is
	const env = { ...process.env, TEXINPUTS: `${root}${path.delimiter}` };
	const child = spawn('lualatex', ['-no-shell-escape', '-interaction=nonstopmode', 'draw.tex'], { cwd: dir, env, windowsHide: true });
	const d: Daemon = {
		key: keyOf(root, preamble),
		dir,
		child,
		out: '',
		waiting: null,
		exited: false,
		failure: null,
		warm: false,
		onWarm: null,
		queue: Promise.resolve(),
		users: new Set(),
		used: 0
	};
	child.stdout.setEncoding('latin1');
	child.stderr.resume();
	child.stdout.on('data', (chunk: string) => {
		d.out += chunk;
		if (!d.warm && d.out.includes(WARM)) {
			d.warm = true;
			d.onWarm?.();
		}
		const at = d.out.indexOf(DONE);
		if (at < 0 || !d.waiting) return;
		const w = d.waiting;
		d.waiting = null;
		const out = d.out.slice(0, at);
		d.out = d.out.slice(at + DONE.length);
		w.resolve(out);
	});
	function ended(failure: Error): void {
		d.exited = true;
		d.failure ??= failure;
		d.waiting?.reject(d.failure);
		d.waiting = null;
		if (daemons.get(d.key) === d) daemons.delete(d.key);
		fs.rm(dir, { recursive: true, force: true }, () => {});
	}
	// after the streams end: TeX's last words are its error
	child.on('close', () => ended(new Error(lastWords(d.out))));
	child.on('error', (e: NodeJS.ErrnoException) => ended(e.code === 'ENOENT' ? new Error(`${PROGRAM_MISSING}lualatex`) : e));
	// a lualatex that never started has no stdin to write the request to
	child.stdin.on('error', () => {});
	return d;
}

type ReportedFont = { file?: string; t1?: { pfb?: string; enc?: string } };

// the files a window may read through draw:file
const reportedFonts = new Set<string>();

function noteFontFiles(fonts: ReportedFont[]): void {
	for (const f of fonts) for (const file of [f.file, f.t1?.pfb, f.t1?.enc]) if (file) reportedFonts.add(file);
}

/** how a program that is not installed is reported to the window, which names it and offers to help */
export const PROGRAM_MISSING = 'program missing: ';

function lastWords(out: string): string {
	const errors = logErrors(out).map((e) => e.message);
	if (errors.length) return errors.join('\n');
	const tail = out.trim().split('\n').slice(-3).join(' ').trim();
	return tail ? `TeX stopped: ${tail.slice(-300)}` : 'TeX stopped without output.';
}

function kill(d: Daemon): void {
	if (!d.exited) d.child.kill();
	if (daemons.get(d.key) === d) daemons.delete(d.key);
}

function retire(d: Daemon): void {
	if (daemons.get(d.key) === d) daemons.delete(d.key);
	void d.queue.then(() => {
		if (d.exited) return;
		d.child.stdin.write('quit\n');
		setTimeout(() => kill(d), 2000);
	});
}

async function drawOne(d: Daemon, picture: string): Promise<unknown> {
	if (d.failure) throw d.failure;
	const t0 = performance.now();
	fs.writeFileSync(path.join(d.dir, 'work', 'picture.tex'), picture);
	d.out = '';
	const out = await new Promise<string>((resolve, reject) => {
		function stuck(message: string): void {
			d.failure = new Error(message);
			kill(d);
			reject(d.failure);
		}
		function picturing(): void {
			stuck(`TeX did not finish this picture within ${STUCK_MS / 1000} seconds.`);
		}
		let timer = d.warm
			? setTimeout(picturing, STUCK_MS)
			: setTimeout(() => stuck(`TeX did not load the preamble within ${COLD_MS / 60_000} minutes.`), COLD_MS);
		d.onWarm = () => {
			clearTimeout(timer);
			timer = setTimeout(picturing, STUCK_MS);
		};
		d.waiting = {
			resolve: (s) => (clearTimeout(timer), resolve(s)),
			reject: (e) => (clearTimeout(timer), reject(e))
		};
		d.child.stdin.write('draw\n');
	});
	const resultPath = path.join(d.dir, 'work', 'result.json');
	const written = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, 'utf8') : null;
	const empty = { w: 0, h: 0, d: 0, marks: [] as unknown[], recs: [] as unknown[], fonts: [] as ReportedFont[], shadings: {}, open: false };
	const { open, ...drawn } = written ? (JSON.parse(written) as typeof empty) : empty;
	noteFontFiles(drawn.fonts);
	// a brace the picture left open keeps TeX inside it: the next picture needs a fresh process
	if (open) kill(d);
	const logged = logErrors(out);
	const unclosed = open ? ['The picture leaves a brace or an environment open.'] : [];
	return {
		...drawn,
		errors: [...unclosed, ...logged.map((e) => e.message)],
		errorLines: [...unclosed.map(() => null), ...logged.map((e) => e.line)],
		stop: false,
		ms: performance.now() - t0
	};
}

export function renderPicture(body: { root: string; preamble: string; picture: string; luaDir: string }, user: number): Promise<unknown> {
	const key = keyOf(body.root, body.preamble);
	let d = daemons.get(key);
	if (!d) {
		d = start(body.root, body.preamble, body.luaDir);
		daemons.set(key, d);
	}
	d.users.add(user);
	d.used = performance.now();
	const drawing = d;
	const next = d.queue.then(() => drawOne(drawing, body.picture));
	d.queue = next.catch(() => {});
	const idle = [...daemons.values()].sort((a, b) => a.used - b.used);
	for (const old of idle.slice(0, Math.max(0, daemons.size - MAX_WARM))) retire(old);
	return next;
}

export function releaseDrawing(user: number): void {
	for (const d of [...daemons.values()]) {
		d.users.delete(user);
		if (!d.users.size) retire(d);
	}
}

export function restartDrawing(user: number): void {
	for (const d of [...daemons.values()]) if (d.users.has(user)) retire(d);
}

export function stopDrawing(): void {
	for (const d of [...daemons.values()]) kill(d);
}

// another TeX is another engine, as live mode's is
onToolPathChange(() => {
	for (const d of [...daemons.values()]) retire(d);
});

export function warmDrawingCount(): number {
	return daemons.size;
}

/** the bytes of a font file the engine reported; the walker names files as TeX found them, a leading slash taken off */
export function engineFile(reported: string): Buffer {
	if (!reportedFonts.has(reported)) throw new Error(`not a font the engine reported: ${reported}`);
	return fs.readFileSync(/^[A-Za-z]:\//.test(reported) || reported.startsWith('/') ? reported : `/${reported}`);
}
