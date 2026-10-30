// One warm lualatex drawing figures for one document: started by the first figure tab, its preamble loaded once,
// then one picture per request. It runs only while a figure tab asks for it.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { drawJob } from './drawJob';
import { logErrors } from './drawLog';

const DONE = '@@TEXPILE_DRAW_DONE';
// a picture that runs longer is taken as stuck: the process ends and the next picture starts a new one
const STUCK_MS = 60_000;

type Waiting = { resolve: (out: string) => void; reject: (e: Error) => void };

type Daemon = {
	key: string;
	dir: string;
	child: ChildProcessWithoutNullStreams;
	out: string;
	waiting: Waiting | null;
	exited: boolean;
};

let daemon: Daemon | null = null;
let queue: Promise<unknown> = Promise.resolve();

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
	const d: Daemon = { key: keyOf(root, preamble), dir, child, out: '', waiting: null, exited: false };
	child.stdout.setEncoding('latin1');
	child.stdout.on('data', (chunk: string) => {
		d.out += chunk;
		const at = d.out.indexOf(DONE);
		if (at < 0 || !d.waiting) return;
		const w = d.waiting;
		d.waiting = null;
		const out = d.out.slice(0, at);
		d.out = d.out.slice(at + DONE.length);
		w.resolve(out);
	});
	child.on('exit', () => {
		d.exited = true;
		d.waiting?.reject(new Error(lastWords(d.out)));
		d.waiting = null;
		if (daemon === d) daemon = null;
		fs.rm(dir, { recursive: true, force: true }, () => {});
	});
	child.on('error', (e) => d.waiting?.reject(e));
	return d;
}

function lastWords(out: string): string {
	const errors = logErrors(out).map((e) => e.message);
	if (errors.length) return errors.join('\n');
	const tail = out.trim().split('\n').slice(-3).join(' ').trim();
	return tail ? `TeX stopped: ${tail.slice(-300)}` : 'TeX stopped without output.';
}

function kill(d: Daemon): void {
	if (!d.exited) d.child.kill();
	if (daemon === d) daemon = null;
}

async function drawOne(root: string, preamble: string, picture: string, luaDir: string): Promise<unknown> {
	const t0 = performance.now();
	if (daemon && daemon.key !== keyOf(root, preamble)) kill(daemon);
	const d = (daemon ??= start(root, preamble, luaDir));
	fs.writeFileSync(path.join(d.dir, 'work', 'picture.tex'), picture);
	d.out = '';
	const out = await new Promise<string>((resolve, reject) => {
		const timer = setTimeout(() => {
			kill(d);
			reject(new Error(`TeX did not finish this picture within ${STUCK_MS / 1000} seconds.`));
		}, STUCK_MS);
		d.waiting = {
			resolve: (s) => (clearTimeout(timer), resolve(s)),
			reject: (e) => (clearTimeout(timer), reject(e))
		};
		d.child.stdin.write('draw\n');
	});
	const resultPath = path.join(d.dir, 'work', 'result.json');
	const written = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, 'utf8') : null;
	const empty = { w: 0, h: 0, d: 0, marks: [], recs: [], fonts: [], shadings: {}, open: false };
	const { open, ...drawn } = written ? (JSON.parse(written) as typeof empty) : empty;
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

/** one instrumented picture, under the document's preamble, drawn by the warm lualatex; pictures queue */
export function renderPicture(body: { root: string; preamble: string; picture: string; luaDir: string }): Promise<unknown> {
	const next = queue.then(() => drawOne(body.root, body.preamble, body.picture, body.luaDir));
	queue = next.catch(() => {});
	return next;
}

export function stopDrawing(): void {
	if (!daemon) return;
	daemon.child.stdin.write('quit\n');
	const d = daemon;
	daemon = null;
	setTimeout(() => kill(d), 2000);
}

// the walker names files as TeX found them, a leading slash taken off
const FONT_FILE = /\.(otf|ttf|pfb|pfa|enc|png|jpe?g)$/i;

/** the bytes of a font or image file the engine reported */
export function engineFile(reported: string): Buffer {
	const file = /^[A-Za-z]:\//.test(reported) || reported.startsWith('/') ? reported : `/${reported}`;
	if (!FONT_FILE.test(file)) throw new Error(`not a font or image: ${reported}`);
	return fs.readFileSync(file);
}
