// Keeps ONE warm lualatex alive (the user's real preamble loaded, keyed by its hash) and
// typesets single blocks on it over stdin/stdout -- nothing else. This is the "no delay
// while typing" engine; the full recompile (draft-service) reconciles on a debounce.
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { resolveType1 } from './font-t1map';

const BLOCK_TIMEOUT_MS = 6000;
const OUT_REL = '_draft';
// \pdfoutput is a pdfTeX primitive luatex lacks; arXiv preambles that set it unguarded
// (\pdfoutput=1) would crash the warm engine. Define it as a dummy count if absent (harmless
// no-op otherwise). Prepended before the preamble so it runs before that assignment. Mirror
// of the compile-side shim in draft-service so the daemon warms whatever the compile compiles.
const PDF_SHIM = `\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi`;

function splitPreamble(mainPath: string): { preamble: string } | null {
	const src = fs.readFileSync(mainPath, 'utf8');
	const m = src.match(/^.*\\begin\{document\}.*$/m);
	if (!m) return null;
	return { preamble: src.slice(0, m.index! + m[0].length) };
}
// (The old unicode-math injection is GONE: the daemon typesets the user's true fonts --
// classic Type1 fonts are parsed and painted directly by the renderer, not re-typeset.)

type Rec = Record<string, unknown>;
type Daemon = {
	child: ChildProcess;
	rl: readline.Interface;
	hash: string;
	root: string;
	hsize: number;
	textheight: number;
	glyphs: Rec[];
	onReady?: () => void;
	onResult?: (s: Rec) => void;
	onGlyphsDone?: () => void;
};

let daemon: Daemon | null = null;
let queue: Promise<unknown> = Promise.resolve();

// A daemon nobody has used in a while is 100-300MB of RSS for nothing; stop it and
// re-warm (~1-2s) on the next request. Armed at request START so it can never fire
// mid-typeset (requests finish in ms or hit the 6s block timeout first).
const IDLE_STOP_MS = 10 * 60 * 1000;
let idleTimer: NodeJS.Timeout | null = null;
function armIdleStop(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		idleTimer = null;
		stopDaemon();
	}, IDLE_STOP_MS);
	idleTimer.unref?.();
}

function hashOf(s: string): string {
	return crypto.createHash('sha1').update(s).digest('hex');
}

function spawnDaemon(root: string, engineDir: string, preamble: string): Promise<Daemon> {
	const engine = engineDir.replace(/\\/g, '/');
	const outDir = path.join(root, '_draft');
	fs.mkdirSync(outDir, { recursive: true });
	const texName = '_draft/texd-daemon.tex';
	// live-refs.tex (exported by draft-service from the resolved aux) carries \bibcite +
	// \newlabel so \cite/\ref resolve in instant patches; biblatex documents instead read
	// _draft/texd_daemon.bbl (a copy of draft.bbl) at \begin{document} automatically.
	// Store the live-refs \newlabel/\bibcite data by DIRECTLY defining \r@<label>/\b@<key>
	// via \csname, bypassing every package's \newlabel (hyperref/book make it \@onlypreamble
	// or robust, so reading the refs after \begin{document} throws "Can be used only in
	// preamble" and kills the daemon). \ref/\cite read those control sequences, so this
	// resolves refs while being immune to whatever the document did to \newlabel.
	const refsSetup =
		`\\makeatletter` +
		`\\long\\def\\newlabel#1#2{\\expandafter\\gdef\\csname r@#1\\endcsname{#2}}` +
		`\\long\\def\\bibcite#1#2{\\expandafter\\gdef\\csname b@#1\\endcsname{#2}}` +
		`\\IfFileExists{${OUT_REL}/live-refs.tex}{\\input{${OUT_REL}/live-refs.tex}}{}` +
		`\\makeatother\n`;
	const wrapper =
		PDF_SHIM +
		preamble +
		refsSetup +
		`\\directlua{TEXPILE_ENGINE_DIR='${engine}'; dofile('${engine}/texd-loop.lua')}\n` +
		`\\newcount\\texdrun \\texdrun=1\n` +
		`\\loop\n\t\\directlua{texd_step()}\n\\ifnum\\texdrun>0 \\repeat\n` +
		`\\end{document}\n`;
	fs.writeFileSync(path.join(root, texName), wrapper);

	const child = spawn(
		'lualatex',
		['-no-shell-escape', '-interaction=nonstopmode', '-output-directory=_draft', '-jobname=texd_daemon', texName],
		{ cwd: root, windowsHide: true }
	);
	const state: Daemon = {
		child,
		rl: null as unknown as readline.Interface,
		hash: hashOf(preamble),
		root,
		hsize: 345,
		textheight: 550,
		glyphs: []
	};
	state.rl = readline.createInterface({ input: child.stdout! });
	// frame markers carry the app prefix (TeX log chatter can contain bare @@, e.g. \@@par
	// in error contexts); per-record lines keep the short @@G -- thousands stream per
	// request, and they're only read between R and GEND
	const MARK = 'texpile-warm@@';
	state.rl.on('line', (raw) => {
		const i = raw.indexOf(MARK);
		if (i >= 0) {
			const l = raw.slice(i + MARK.length);
			if (l.startsWith('READY')) {
				// both dimensions are engine registers; a READY without them is a failed
				// warm-up, never a guessed page size
				const m = l.match(/^READY\s+([\d.]+)\s+([\d.]+)/);
				if (!m) {
					state.child.kill('SIGKILL');
					return;
				}
				state.hsize = parseFloat(m[1]);
				state.textheight = parseFloat(m[2]);
				state.onReady?.();
			} else if (l.startsWith('R ')) {
				try {
					state.onResult?.(JSON.parse(l.slice(2)));
				} catch {
					/* skip */
				}
			} else if (l.startsWith('GEND')) {
				state.onGlyphsDone?.();
			}
			return;
		}
		const g = raw.indexOf('@@G ');
		if (g >= 0) {
			try {
				state.glyphs.push(JSON.parse(raw.slice(g + 4)));
			} catch {
				/* skip */
			}
		}
	});
	return new Promise<Daemon>((resolve, reject) => {
		let ready = false;
		state.onReady = () => {
			ready = true;
			resolve(state);
		};
		child.on('exit', (code) => {
			if (daemon === state) daemon = null;
			if (!ready) reject(new Error(`daemon exited before ready (code ${code})`));
		});
		setTimeout(() => {
			if (!ready) reject(new Error('daemon warm timeout'));
		}, 30000);
	});
}

async function ensureDaemon(root: string, engineDir: string, preamble: string): Promise<Daemon> {
	const h = hashOf(preamble);
	if (daemon && daemon.hash === h && daemon.root === root) return daemon;
	if (daemon) {
		try {
			daemon.child.kill('SIGKILL');
		} catch {
			/* ignore */
		}
		daemon = null;
	}
	daemon = await spawnDaemon(root, engineDir, preamble);
	return daemon;
}

function typesetOn(state: Daemon, text: string, hsize: number): Promise<{ records: Rec[]; stats: Rec | null; timedOut?: boolean }> {
	return new Promise((resolve) => {
		state.glyphs = [];
		let stats: Rec | null = null;
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			try {
				state.child.kill('SIGKILL');
			} catch {
				/* ignore */
			}
			// drop the reference NOW (don't wait for the async 'exit' event) so the next queued
			// request respawns a fresh daemon instead of writing to this dead one
			if (daemon === state) daemon = null;
			resolve({ records: [], stats: null, timedOut: true });
		}, BLOCK_TIMEOUT_MS);
		state.onResult = (s) => (stats = s);
		state.onGlyphsDone = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ records: state.glyphs, stats });
		};
		// LINE-FAITHFUL payload: normalize only the line-ending byte form (\r\n -> \n) and
		// ship every line as-is -- the ENGINE's catcodes decide what newlines, blank lines,
		// and % comments mean. Framing = line count + byte count of the joined payload.
		const payload = text.replace(/\r\n?/g, '\n');
		const nLines = payload.split('\n').length;
		state.child.stdin!.write(`HSIZE ${hsize}\nGLYPHS\nTEXT ${nLines} ${Buffer.byteLength(payload, 'utf8')}\n${payload}\nEND\n`);
	});
}

export type ParagraphResult =
	| { ok: true; records: Rec[]; stats: Rec | null; hsize: number; textheight: number }
	| { ok: false; error: string };

// Typeset one block on the warm daemon (spawning/reusing it for the current preamble).
// Requests are serialized so the single stdin protocol never interleaves.
export async function typesetParagraph(body: {
	root: string;
	mainFile: string;
	engineDir: string;
	text: string;
	hsize?: number;
}): Promise<ParagraphResult> {
	const run = queue.then(async (): Promise<ParagraphResult> => {
		try {
			armIdleStop();
			const split = splitPreamble(path.join(body.root, body.mainFile));
			if (!split) return { ok: false, error: 'no \\begin{document} in main file' };
			const preamble = split.preamble;
			const state = await ensureDaemon(body.root, body.engineDir, preamble);
			const hsize = body.hsize && body.hsize > 0 ? body.hsize : state.hsize;
			const r = await typesetOn(state, body.text, hsize);
			if (r.timedOut) return { ok: false, error: 'paragraph typeset timed out (daemon reset)' };
			// Type1: attach { pfb, enc }; async -- kpsewhich spawns must not block the main process
			await Promise.all(r.records.filter((rec) => (rec as any).t === 'font').map((rec) => resolveType1(rec)));
			return { ok: true, records: r.records, stats: r.stats, hsize, textheight: state.textheight };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	});
	queue = run.catch(() => undefined);
	return run;
}

export function stopDaemon(): void {
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
	if (daemon) {
		try {
			daemon.child.kill('SIGKILL');
		} catch {
			/* ignore */
		}
		daemon = null;
	}
}
