// Holds ONE lualatex warmed through the user's preamble -- hooks registered,
// \begin{document} executed, fonts loaded -- parked in texpile_warm_wait() until the next
// full pass supplies the body. Measured: the preamble is 59-80% of a pass on ordinary
// documents (paper 744/1150ms, transformer 2181/2706ms), so this is most of what a
// reconcile costs there; a body-dominated book barely moves and that is expected.
//
// The body ships as _draft/texd-body.tex, PADDED with '%' lines so its line numbers equal
// the main file's -- source stamps, counter lines, and synctex stay truthful, and the
// service aliases the leftover file NAME back to the main file's.
//
// The process runs under its OWN jobname (texd_warm): the previous pass's aux/toc/bbl are
// copied in at spawn (so \ref/\cite resolve exactly as a cold pass would), and its products
// are promoted to draft.* only when the pass is adopted. While it idles it touches nothing
// the app reads -- the Problems panel's draft.log, the aux the rerun logic hashes -- and a
// mismatch-kill has nothing to restore. Anything off -- preamble changed, process died,
// another engine -- and the caller compiles cold; this is an accelerator, never a dependency.
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import readline from 'node:readline';
import { jobPrefix, writeHooksFile, OUT } from './compileJob';
import { shellEnvReady } from '../shell/shellEnv';

export const WARM_BODY = 'texd-body.tex';
const JOB = 'texd_warm';
// products the previous pass wrote under `draft` that the engine READS by \jobname: the aux
// (refs/cites at \begin{document}), the listings (\tableofcontents and friends), hyperref's
// .out, the bibliography (.bbl: biblatex at \begin{document}, classic bibtex at
// \bibliography), and makeindex's .ind
const SEED_EXTS = ['aux', 'toc', 'lof', 'lot', 'out', 'bbl', 'ind'];
// seeded copies the engine itself never writes: deleted at promotion, never renamed over
// the app-managed originals (draftBib owns draft.bbl)
const SEED_ONLY = new Set(['bbl', 'ind']);

export type WarmSplit = { preamble: string; beginLine: number };

/** the main file up to and including its \begin{document} line, and that line's 1-based number */
export function splitForWarm(mainAbs: string): WarmSplit | null {
	let src: string;
	try {
		src = fs.readFileSync(mainAbs, 'utf8');
	} catch {
		return null;
	}
	const m = src.match(/^.*\\begin\{document\}.*$/m);
	if (!m || m.index === undefined) return null;
	const preamble = src.slice(0, m.index + m[0].length);
	return { preamble, beginLine: preamble.split('\n').length };
}

/** the body padded to the main file's own line numbers: line k here IS line k there */
export function paddedBody(mainSrc: string, beginLine: number): string {
	const body = mainSrc.split('\n').slice(beginLine).join('\n');
	return '%\n'.repeat(beginLine) + body;
}

type Warm = { child: ChildProcess; key: string; hash: string; ready: boolean; dead: boolean };

let warm: Warm | null = null;
let idleTimer: NodeJS.Timeout | null = null;

// a warm engine nobody compiles with is ~200MB of RSS for nothing (same policy as the daemon)
const IDLE_STOP_MS = 10 * 60 * 1000;
function armIdleStop(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		idleTimer = null;
		stopWarmCompiler();
	}, IDLE_STOP_MS);
	idleTimer.unref?.();
}

const keyOf = (root: string) => (process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root));
const hashOf = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

function dropJobFiles(outAbs: string): void {
	let names: string[] = [];
	try {
		names = fs.readdirSync(outAbs);
	} catch {
		return;
	}
	for (const n of names)
		if (n.startsWith(JOB + '.')) {
			try {
				fs.rmSync(path.join(outAbs, n), { force: true });
			} catch {
				/* locked by a dying engine: the next spawn retries */
			}
		}
}

/** Claim the warm process for this compile: alive, ready, and warmed on exactly this preamble. */
export function takeWarmCompiler(root: string, preamble: string): Warm | null {
	const w = warm;
	if (!w || w.key !== keyOf(root)) return null;
	warm = null;
	if (w.dead || !w.ready || w.hash !== hashOf(preamble)) {
		try {
			w.child.kill('SIGKILL');
		} catch {
			/* already gone */
		}
		return null;
	}
	return w;
}

/**
 * Release the body: the process compiles it and exits like any pass. On exit, its products
 * are promoted to draft.* only when `adopt()` still holds -- a superseded run's partial
 * files must never clobber the good ones.
 */
export function goWarmCompiler(
	w: Warm,
	root: string,
	mainSrc: string,
	beginLine: number,
	adopt: () => boolean
): { child: ChildProcess; done: Promise<void> } {
	const outAbs = path.join(root, OUT);
	fs.writeFileSync(path.join(outAbs, WARM_BODY), paddedBody(mainSrc, beginLine));
	const done = new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			try {
				w.child.kill('SIGKILL');
			} catch {
				/* already gone */
			}
		}, 120000);
		const finish = () => {
			clearTimeout(timer);
			if (adopt()) promote(outAbs);
			else dropJobFiles(outAbs);
			resolve();
		};
		if (w.dead) {
			finish();
			return;
		}
		w.child.on('exit', finish);
		w.child.stdin?.write('GO\n');
	});
	return { child: w.child, done };
}

/** texd_warm.* -> draft.*, exactly what a cold pass would have written under `draft` */
function promote(outAbs: string): void {
	let names: string[] = [];
	try {
		names = fs.readdirSync(outAbs);
	} catch {
		return;
	}
	for (const n of names) {
		if (!n.startsWith(JOB + '.')) continue;
		const suffix = n.slice(JOB.length + 1);
		const from = path.join(outAbs, n);
		try {
			if (SEED_ONLY.has(suffix)) fs.rmSync(from, { force: true });
			else {
				const to = path.join(outAbs, 'draft.' + suffix);
				fs.rmSync(to, { force: true });
				fs.renameSync(from, to);
			}
		} catch {
			/* a locked file costs that one product, not the compile */
		}
	}
}

/** Warm the NEXT pass's engine. Fire-and-forget; call only after a compile's products are final. */
export function rewarmCompiler(root: string, mainFile: string, engineDir: string): void {
	// A beat later, not now: a compile landing is exactly when the app repaints every page
	// and the user's next keystroke wants the daemon -- a lualatex spawning through its
	// preamble at that moment contends with both, and the warm-up still finishes long
	// before the next typing pause could ask for it.
	const t = setTimeout(() => {
		const split = splitForWarm(path.join(root, mainFile));
		if (!split) return;
		stopWarmCompiler();
		void spawnWarm(root, engineDir, split.preamble).catch(() => undefined);
	}, 1200);
	t.unref?.();
}

async function spawnWarm(root: string, engineDir: string, preamble: string): Promise<void> {
	await shellEnvReady();
	const outAbs = path.join(root, OUT);
	fs.mkdirSync(outAbs, { recursive: true });
	dropJobFiles(outAbs);
	// the previous pass's products, under the warm jobname, so \begin{document} resolves
	// refs/cites from exactly what a cold pass would read
	for (const ext of SEED_EXTS) {
		const src = path.join(outAbs, 'draft.' + ext);
		if (fs.existsSync(src))
			try {
				fs.copyFileSync(src, path.join(outAbs, JOB + '.' + ext));
			} catch {
				/* a missing seed degrades refs for one pass, same as a cold first compile */
			}
	}
	writeHooksFile(outAbs); // input at \begin{document}, which runs NOW, not at GO
	const wrapperRel = `${OUT}/texd-compile.tex`;
	// the cold job is prefix + \input{main}; this is prefix + the same preamble text + a wait
	// + \input{body}. \end{document} after the input is a backstop for a body missing its own.
	fs.writeFileSync(
		path.join(root, wrapperRel),
		`${jobPrefix(engineDir)}${preamble}\n\\directlua{texpile_warm_wait()}\n\\input{${OUT}/${WARM_BODY}}\n\\end{document}\n`
	);
	const child = spawn(
		'lualatex',
		['-no-shell-escape', '-interaction=nonstopmode', '-synctex=1', `-output-directory=${OUT}`, `-jobname=${JOB}`, wrapperRel],
		{ cwd: root, windowsHide: true }
	);
	const state: Warm = { child, key: keyOf(root), hash: hashOf(preamble), ready: false, dead: false };
	warm = state;
	armIdleStop();
	const rl = readline.createInterface({ input: child.stdout! });
	rl.on('line', (l) => {
		if (l.includes('TEXPILE_WARM_READY')) state.ready = true;
	});
	child.on('exit', () => {
		state.dead = true;
		if (warm === state) warm = null;
	});
	child.on('error', () => {
		state.dead = true;
		if (warm === state) warm = null;
	});
}

/** synctex named the padded body file and the warm jobname; line numbers already match, so
 *  only the names lie */
export function aliasSynctex(outAbs: string, mainRel: string): void {
	const p = path.join(outAbs, 'draft.synctex.gz');
	try {
		const txt = zlib.gunzipSync(fs.readFileSync(p)).toString('latin1');
		if (!txt.includes(WARM_BODY) && !txt.includes(JOB)) return;
		const out = txt
			.split(`${OUT}/${WARM_BODY}`)
			.join(mainRel)
			.split(JOB + '.pdf')
			.join('draft.pdf');
		fs.writeFileSync(p, zlib.gzipSync(Buffer.from(out, 'latin1')));
	} catch {
		/* synctex absent or unreadable: forward sync degrades, records are unaffected */
	}
}

export function stopWarmCompiler(): void {
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
	if (warm) {
		try {
			warm.child.kill('SIGKILL');
		} catch {
			/* already gone */
		}
		warm = null;
	}
}
