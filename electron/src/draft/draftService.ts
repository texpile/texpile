// Runs ONE full engine compile of the user's main file and returns its pages. Every pass is an engine from the pool
// (page-extract and teleport set up through the job string; the source is never touched), the bibliography cycles
// between passes (draftBib), and the last pass's points become the index edits teleport from.
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { seedBbl, auxCycle } from './draftBib';
import { OUT } from './compileJob';
import { collectSeeds, promote, readPage, type DraftPage, type ReadBackFiles } from './draftProducts';
import { takeEngine, diskPreamble, stampOf } from './teleport/enginePool';
import { PointIndex, readIndexFile } from './teleport/pointIndex';
import { adoptIndex } from './teleport/teleportService';
import type { DraftEngine } from './teleport/draftEngine';
import { shellEnvReady } from '../shell/shellEnv';
import { findProgram } from '../shell/findProgram';

export type DraftResult =
	| {
			ok: true;
			ms: number;
			count: number;
			passes: number;
			paperW: number;
			paperH: number;
			// the files whose paragraphs were stamped, in id order: a line record's "sf" is a 1-based index into this
			srcFiles: string[];
			// the line \begin{document} executed at (in the main file), from the hook itself
			bodyLine?: number;
			marginX: number;
			marginY: number;
			pages: DraftPage[];
	  }
	/** error 'engine-missing' names the program in `tool` */
	| { ok: false; error: string; ms: number; log?: string; superseded?: true; tool?: string };

type DraftBody = { root: string; mainFile: string; engineDir: string; engine?: string; readBack: ReadBackFiles };

// a newer compile of the same root kills this one's engine, so a slow pass never holds the preview
type CompileRun = { gen: number; engine: DraftEngine | null };
const compileRuns = new Map<string, CompileRun>();
function runFor(root: string): CompileRun {
	const key = process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
	let r = compileRuns.get(key);
	if (!r) {
		r = { gen: 0, engine: null };
		compileRuns.set(key, r);
	}
	return r;
}

// TeX places the shipped page's reference point 1in (72.27pt) from the paper's top-left by default
const ONE_INCH_PT = 72.27;
const PASS_TIMEOUT_MS = 120000;

export async function compileDraft(body: DraftBody): Promise<DraftResult> {
	await shellEnvReady();
	const { root } = body;
	const mainRel = body.mainFile.replace(/\\/g, '/');
	const engineDir = body.engineDir.replace(/\\/g, '/');
	const engine = body.engine || 'lualatex';
	if (!findProgram(engine)) return { ok: false, error: 'engine-missing', tool: engine, ms: 0 };
	const outAbs = path.join(root, OUT);
	const run = runFor(root);
	const gen = ++run.gen;
	run.engine?.remove();
	run.engine = null;
	function superseded(): boolean {
		return gen !== run.gen;
	}
	fs.mkdirSync(outAbs, { recursive: true });
	// users' projects are usually git repositories, and the preview's artifacts must never be staged in them
	const gi = path.join(outAbs, '.gitignore');
	if (!fs.existsSync(gi)) fs.writeFileSync(gi, '*\n');

	let last: { engine: DraftEngine; seedDir: string; preFiles: string[]; preStamp: string } | null = null;
	async function enginePass(): Promise<void> {
		if (superseded()) return;
		const seedDir = collectSeeds(root, outAbs, body.readBack);
		const preamble = diskPreamble(root, mainRel) ?? '';
		const eng = await takeEngine({ root, mainRel, engineDir, engine, seedDir, preamble, preStamp: null });
		if (superseded()) {
			eng.remove();
			return;
		}
		run.engine = eng;
		const timer = setTimeout(() => eng.kill(), PASS_TIMEOUT_MS);
		const preFiles = await eng.ready;
		const preStamp = preFiles ? stampOf(root, preFiles) : '';
		await eng.go();
		clearTimeout(timer);
		if (run.engine === eng) run.engine = null;
		if (superseded()) {
			eng.remove();
			return;
		}
		promote(eng.abs, outAbs, root, body.readBack);
		last?.engine.remove();
		last = preFiles ? { engine: eng, seedDir, preFiles, preStamp } : null;
		if (!preFiles) eng.remove();
	}

	// the pass products a rerun would read differently: cross-refs and the contents listings
	const REF_FILES = body.readBack.byTex.map((ext) => `draft.${ext}`);
	function refState(): string {
		return REF_FILES.map((f) => {
			try {
				return crypto
					.createHash('sha1')
					.update(fs.readFileSync(path.join(outAbs, f)))
					.digest('hex');
			} catch {
				return '';
			}
		}).join(' ');
	}
	const t0 = Date.now();
	const auxExisted = fs.existsSync(path.join(outAbs, 'draft.aux'));
	const refsBefore = refState();
	seedBbl(root, outAbs, body.mainFile);
	await enginePass();
	let passes = 1;
	// a changed .bbl needs up to two extra passes (bbl read, \bibcite written, \cite resolved); a first compile one
	const bblChanged = superseded() ? false : await auxCycle(root, outAbs, body.mainFile);
	const extra = bblChanged ? 2 : !auxExisted ? 1 : 0;
	for (let i = 0; i < extra && !superseded(); i++) {
		await enginePass();
		passes++;
	}
	// the engine announced a rerun and the files it reads did change: one bounded pass more
	if (!superseded()) {
		let log = '';
		try {
			log = fs.readFileSync(path.join(outAbs, 'draft.log'), 'utf8');
		} catch {
			// no log, no signal
		}
		const complained = /No file draft\.(toc|lof|lot)\.|Label\(s\) may have changed|There were undefined references/.test(log);
		if (complained && refState() !== refsBefore) {
			await enginePass();
			passes++;
		}
	}
	if (superseded()) return { ok: false, error: 'superseded', ms: Date.now() - t0, superseded: true };
	const ms = Date.now() - t0;

	const manifestPath = path.join(outAbs, 'pages.json');
	if (!fs.existsSync(manifestPath)) {
		let log = '';
		try {
			log = fs
				.readFileSync(path.join(outAbs, 'draft.log'), 'utf8')
				.split('\n')
				.filter((l) => /^!|error/i.test(l))
				.slice(-12)
				.join('\n');
		} catch {
			/* no log */
		}
		return { ok: false, error: 'Draft compile produced no pages (is lualatex on PATH? see _draft/draft.log)', ms, log };
	}

	let manifest: {
		count: number;
		paperW?: number;
		paperH?: number;
		hOffset?: number;
		vOffset?: number;
		srcFiles?: string[];
		bodyLine?: number;
		pages: { n: number; w: number; h: number; unc?: string }[];
	};
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	} catch (e) {
		return { ok: false, error: 'Draft manifest unreadable: ' + (e instanceof Error ? e.message : String(e)), ms };
	}

	const done = last as { engine: DraftEngine; seedDir: string; preFiles: string[]; preStamp: string } | null;
	if (done) {
		const index = new PointIndex(
			readIndexFile(path.join(done.engine.abs, 'tele', 'index.jsonl')),
			mainRel,
			manifest.bodyLine ?? 0,
			done.preFiles,
			done.preStamp,
			done.seedDir
		);
		index.adoptBasis(done.engine.abs);
		index.fontList = `${done.engine.rel}/tele/fonts.lua`;
		adoptIndex({ root, mainRel, engineDir, index, count: manifest.count, srcFiles: manifest.srcFiles ?? [] });
	}

	const pages: DraftPage[] = [];
	for (let n = 1; n <= manifest.count; n++) {
		const meta = manifest.pages[n - 1] || { n, w: 0, h: 0 };
		pages.push(await readPage(outAbs, root, n, meta.w, meta.h, meta.unc));
	}
	// some classes never set the page dimension registers: the paper is then the widest shipped box plus the margins
	const maxPageW = manifest.pages.length ? Math.max(...manifest.pages.map((p) => p.w || 0)) : 0;
	const maxPageH = manifest.pages.length ? Math.max(...manifest.pages.map((p) => p.h || 0)) : 0;
	return {
		ok: true,
		ms,
		passes,
		count: manifest.count,
		paperW: manifest.paperW || (maxPageW ? maxPageW + 2 * ONE_INCH_PT : 0),
		paperH: manifest.paperH || (maxPageH ? maxPageH + 2 * ONE_INCH_PT : 0),
		srcFiles: manifest.srcFiles ?? [],
		bodyLine: manifest.bodyLine,
		// TeX's 1in reference point, moved by the document's own \hoffset/\voffset
		marginX: ONE_INCH_PT + (manifest.hOffset || 0),
		marginY: ONE_INCH_PT + (manifest.vOffset || 0),
		pages
	};
}
