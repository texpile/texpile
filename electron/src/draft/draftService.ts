// Runs ONE full engine compile of the user's main file and returns its pages -- nothing
// else. The job string injects the page-extract.lua shipout hook (contained in _draft/,
// source never touched); the result is the engine's manifest + per-page records, with
// image filenames (draftImages) and Type1 font paths (fontT1Map) attached, the
// bibliography cycled between passes (draftBib), and refs exported for the warm daemon
// (draftRefs). Same engine as the user's own compile, so exact by construction.
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { resolveType1Line } from '../fontT1Map';
import { seedBbl, auxCycle } from './draftBib';
import { exportDaemonRefs } from './draftRefs';
import { readImageUses, attachImageFiles } from './draftImages';
import { jobPrefix, writeHooksFile } from './compileJob';
import { splitForWarm, takeWarmCompiler, goWarmCompiler, rewarmCompiler, aliasSynctex, WARM_BODY } from './draftWarmCompile';
import { shellEnvReady } from '../shell/shellEnv';

// ht = the shipout box HEIGHT = distance from box top to the box baseline, which is the
// FOOTER line's baseline -- the renderer uses it to keep bottom-anchored footers out of
// patch shifts (h additionally includes the box depth below that baseline)
// unc = the walker's certification reasons for this page (comma-joined: literal, transform,
// escape, dir), absent when it is fully record-renderable
// gs/gsn/go = the shipped vpack's glue_set/sign/order: gsn 1 means the page was stretched
// to \textheight (flushbottom) and a patch's delta distributes over its vg records
export type DraftPage = {
	n: number;
	w: number;
	h: number;
	ht?: number;
	gs?: number;
	gsn?: number;
	go?: number;
	unc?: string;
	// the walker's own proof for this page: how far its pen finished from the engine's line
	// width on the worst justified line. Measured 0.0000 on every page of every fixture, so a
	// nonzero value is an anomaly worth seeing, not a tolerance to tune.
	dev?: number;
	records: string;
};
export type DraftResult =
	| {
			ok: true;
			ms: number;
			count: number;
			passes: number;
			paperW: number;
			paperH: number;
			colW: number;
			textW: number;
			footSkip: number;
			// engine registers the renderer used to guess: \columnsep, \baselineskip, \parskip
			colSep: number;
			blSkip: number;
			parSkip: number;
			// \topskip: where a column's first baseline lands (chain-planner landing rule)
			topSkip: number;
			// the files whose paragraphs were stamped, in id order: a line record's "sf" is a
			// 1-based index into this. Line numbers are file-local, so the id is what makes
			// "line 45" mean anything in a multi-file project.
			srcFiles: string[];
			// the line \begin{document} executed at (in the main file), from the hook itself
			bodyLine?: number;
			// per-line counter snapshots (see page-extract.lua): the daemon pins to these
			counters: { l: number; f?: string; s: Record<string, number> }[];
			// per-break pruned runs (see page-extract.lua seam capture): the material TeX
			// discarded at each column/page break, keyed by page + 1-based column index
			seams: { page: number; col: number; fire?: number; pen: number; run: Record<string, number>[] }[];
			marginX: number;
			marginY: number;
			pages: DraftPage[];
	  }
	| { ok: false; error: string; ms: number; log?: string; superseded?: true };

type DraftBody = { root: string; mainFile: string; engineDir: string; engine?: string };

const OUT = '_draft';

// Cancel-on-supersede: a newer compileDraft for the SAME root kills that root's in-flight
// lualatex so a hung/slow compile can't hold the 120s pass timeout and stick the preview --
// the editor just fires the fresh compile and the stale one bails. gen is the monotonic run
// id per root; a run is superseded once its root's gen moves past it. Keyed per root so one
// window's compile can never cancel another window's.
type CompileRun = { gen: number; child: import('node:child_process').ChildProcess | null };
const compileRuns = new Map<string, CompileRun>();
function runFor(root: string): CompileRun {
	const key = process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
	let r = compileRuns.get(key);
	if (!r) {
		r = { gen: 0, child: null };
		compileRuns.set(key, r);
	}
	return r;
}

// TeX places the shipped page's reference point 1in (72.27pt) from the paper's top-left
// by default; the extracted box coords are relative to that point.
const ONE_INCH_PT = 72.27;

export async function compileDraft(body: DraftBody): Promise<DraftResult> {
	await shellEnvReady();
	const { root, mainFile } = body;
	const engineDir = body.engineDir.replace(/\\/g, '/');
	const engine = body.engine || 'lualatex';
	const outAbs = path.join(root, OUT);
	// supersede any in-flight compile of THIS root: kill its lualatex so this fresh run
	// isn't stuck behind it (other roots' compiles are untouched)
	const run = runFor(root);
	const gen = ++run.gen;
	if (run.child) {
		try {
			run.child.kill('SIGKILL');
		} catch {
			/* already gone */
		}
		run.child = null;
	}
	function superseded(): boolean {
		return gen !== run.gen;
	}
	fs.mkdirSync(outAbs, { recursive: true });
	// self-ignoring build dir: users' projects are usually git repos, and the preview's
	// artifacts must never end up staged in them
	const gi = path.join(outAbs, '.gitignore');
	if (!fs.existsSync(gi)) {
		try {
			fs.writeFileSync(gi, '*\n');
		} catch {
			/* ignore */
		}
	}
	// clear stale page files so a shorter document doesn't keep orphaned pages
	for (const f of fs.readdirSync(outAbs))
		if (/^page-\d+\.jsonl$/.test(f) || f === 'pages.json' || f === 'counters.jsonl' || f === 'seams.jsonl') {
			try {
				fs.rmSync(path.join(outAbs, f));
			} catch {
				/* ignore */
			}
		}

	// forward-slash the input path for TeX; keep it relative to the compile cwd (root)
	const mainRel = mainFile.replace(/\\/g, '/');
	writeHooksFile(outAbs);
	const job = `${jobPrefix(engineDir)}\\input{${mainRel}}`;
	// A pre-warmed engine (preamble loaded, parked before the body) takes the FIRST pass;
	// extra passes and every fallback go cold. lualatex only: the warm pool spawns that.
	const split = engine === 'lualatex' ? splitForWarm(path.join(root, mainFile)) : null;
	let warmLeft = split ? takeWarmCompiler(root, split.preamble) : null;
	let usedWarm = false;
	function enginePass(): Promise<void> {
		if (superseded()) return Promise.resolve(); // a newer compile already took over
		if (warmLeft && split) {
			const w = warmLeft;
			warmLeft = null;
			usedWarm = true;
			// adopt: a superseded run's partial products must never be promoted over draft.*
			const g = goWarmCompiler(w, root, fs.readFileSync(path.join(root, mainFile), 'utf8'), split.beginLine, () => !superseded());
			run.child = g.child; // a superseding compile of this root kills this to unblock itself
			return g.done.then(() => {
				if (run.child === g.child) run.child = null;
			});
		}
		return new Promise<void>((resolve) => {
			const child = execFile(
				engine,
				// -synctex=1 so the instant path can map a source line to its page box (draft.synctex.gz)
				['-no-shell-escape', '-interaction=nonstopmode', '-synctex=1', `-output-directory=${OUT}`, '-jobname=draft', job],
				{ cwd: root, timeout: 120000, maxBuffer: 32 * 1024 * 1024 },
				() => {
					if (run.child === child) run.child = null;
					resolve();
				}
			);
			run.child = child; // a superseding compile of this root kills this to unblock itself
			child.on('error', () => {
				if (run.child === child) run.child = null;
				resolve();
			}); // engine not on PATH etc -> handled by the manifest check below
		});
	}

	// the pass products a rerun would read differently: cross-refs and the contents listings
	const REF_FILES = ['draft.aux', 'draft.toc', 'draft.lof', 'draft.lot'];
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
	seedBbl(root, outAbs, mainFile);
	await enginePass();
	if (superseded()) return { ok: false, error: 'superseded', ms: Date.now() - t0, superseded: true };
	let passes = 1;
	// aux cycle: bibliography tools + the classic reruns. A changed .bbl needs up to TWO
	// extra passes (classic bibtex chain: bbl read in pass 2 writes \bibcite to the aux,
	// \cite resolves in pass 3); a missing aux (first-ever compile) needs one, so
	// \cite/\ref/\tableofcontents see the freshly written aux/toc. Ordinary text edits
	// keep the .bbl stable (bcf-hash + mtime guards) and stay single-pass.
	const bblChanged = await auxCycle(root, outAbs, mainFile);
	const extra = bblChanged ? 2 : !auxExisted ? 1 : 0;
	for (let i = 0; i < extra && !superseded(); i++) {
		await enginePass();
		passes++;
	}
	if (superseded()) return { ok: false, error: 'superseded', ms: Date.now() - t0, superseded: true };
	// engine-announced rerun: the last pass complained about products it writes itself (a
	// \tableofcontents with no .toc yet -- a stale aux from an aborted run skips the
	// missing-aux pass above -- moved labels, undefined \ref/\cite) AND those files
	// actually changed. One bounded pass; the changed-guard keeps a genuinely broken
	// \ref from rerunning forever.
	{
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
	exportDaemonRefs(outAbs);
	const ms = Date.now() - t0;
	// Warm the NEXT pass now: every product this compile reads has been read (aux cycle,
	// refs, log checks), and the warm process runs under its own jobname so nothing the app
	// reads after this return is touched. Also on the failure path -- a body typo does not
	// invalidate the preamble, and the next attempt deserves the same head start.
	const rewarm = () => {
		if (engine === 'lualatex') rewarmCompiler(root, mainFile, engineDir);
	};

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
		rewarm();
		return { ok: false, error: 'Draft compile produced no pages (is lualatex on PATH? see _draft/draft.log)', ms, log };
	}

	let manifest: {
		count: number;
		paperW?: number;
		paperH?: number;
		colW?: number;
		bodyLine?: number;
		pages: { n: number; w: number; h: number; ht?: number; gs?: number; gsn?: number; go?: number; unc?: string; dev?: number }[];
	};
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	} catch (e) {
		return { ok: false, error: 'Draft manifest unreadable: ' + (e instanceof Error ? e.message : String(e)), ms };
	}

	// counter-truth sidecar: per-line snapshots the renderer pins daemon typesets to
	let counters: { l: number; f?: string; s: Record<string, number> }[] = [];
	try {
		counters = fs
			.readFileSync(path.join(outAbs, 'counters.jsonl'), 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((ln) => JSON.parse(ln));
	} catch {
		/* older engine bridge or an empty log: pins fall back to fixed values */
	}

	// A warm first pass read the body from the padded _draft file, so single-pass products
	// name it where a cold pass names the main file (line numbers already agree -- that is
	// what the padding buys). Put the main file's name back so nothing downstream can tell
	// which kind of pass ran. Multi-pass compiles end on a cold pass and alias nothing.
	if (usedWarm && split && passes === 1) {
		const mainBase = path.basename(mainRel);
		// the padded body reads as texd-body.tex, and anything read via \jobname (the seeded
		// bbl, an .ind) as texd_warm.*; a cold pass names main.tex and draft.* there
		const alias = (f: string): string => {
			const lower = f.toLowerCase();
			if (lower === WARM_BODY.toLowerCase()) return mainBase.toLowerCase();
			if (lower.startsWith('texd_warm.')) return 'draft.' + f.slice('texd_warm.'.length);
			return f;
		};
		const sf = (manifest as { srcFiles?: string[] }).srcFiles;
		if (sf) for (let i = 0; i < sf.length; i++) sf[i] = alias(sf[i]);
		for (const c of counters) if (c.f) c.f = alias(c.f);
		// begindoc fired inside the warm wrapper, so its line number names the wrong file
		manifest.bodyLine = split.beginLine;
		aliasSynctex(outAbs, mainRel);
	}

	// seam sidecar: per-break pruned runs; absent (older engine, luatexbase missing) means
	// the chain planner falls back to its guessed junction gap and stays provisional
	let seams: { page: number; col: number; fire?: number; pen: number; run: Record<string, number>[] }[] = [];
	try {
		seams = fs
			.readFileSync(path.join(outAbs, 'seams.jsonl'), 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((ln) => JSON.parse(ln));
	} catch {
		/* no seams: junction gaps stay guessed */
	}

	const imageUses = readImageUses(outAbs);
	const pages: DraftPage[] = [];
	for (let n = 1; n <= manifest.count; n++) {
		const p = path.join(outAbs, `page-${String(n).padStart(3, '0')}.jsonl`);
		const meta = manifest.pages[n - 1] || { n, w: 0, h: 0 };
		let records = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
		if ((imageUses.length && records.includes('"t":"image"')) || records.includes('"t":"font"')) {
			const lines = records.split('\n');
			attachImageFiles(lines, imageUses, root);
			// font resolution spawns kpsewhich (async; a sync spawn here froze the app's UI)
			await Promise.all(
				lines.map(async (ln, i) => {
					if (ln.startsWith('{"t":"font"')) lines[i] = await resolveType1Line(ln);
				})
			);
			records = lines.join('\n');
		}
		pages.push({ n, w: meta.w, h: meta.h, ht: meta.ht, gs: meta.gs, gsn: meta.gsn, go: meta.go, unc: meta.unc, dev: meta.dev, records });
	}

	// some classes never set the engine's page-dimension registers, leaving paperW/H = 0 in the
	// manifest (the preview would render zero-sized pages): fall back to the shipped page BOX
	// dims (always known at shipout) plus the 1in reference margins
	const maxPageW = manifest.pages.length ? Math.max(...manifest.pages.map((p) => p.w || 0)) : 0;
	const maxPageH = manifest.pages.length ? Math.max(...manifest.pages.map((p) => p.h || 0)) : 0;
	rewarm();
	return {
		ok: true,
		ms,
		passes,
		count: manifest.count,
		paperW: manifest.paperW || (maxPageW ? maxPageW + 2 * ONE_INCH_PT : 0),
		paperH: manifest.paperH || (maxPageH ? maxPageH + 2 * ONE_INCH_PT : 0),
		colW: manifest.colW || 0,
		textW: (manifest as { textW?: number }).textW || 0,
		footSkip: (manifest as { footSkip?: number }).footSkip || 0,
		colSep: (manifest as { colSep?: number }).colSep || 0,
		blSkip: (manifest as { blSkip?: number }).blSkip || 0,
		parSkip: (manifest as { parSkip?: number }).parSkip || 0,
		topSkip: (manifest as { topSkip?: number }).topSkip || 0,
		srcFiles: (manifest as { srcFiles?: string[] }).srcFiles || [],
		bodyLine: manifest.bodyLine,
		counters,
		seams,
		// the page's reference point: TeX's 1in default MOVED by the document's own
		// \hoffset/\voffset, instead of assuming every document leaves them at zero
		marginX: ONE_INCH_PT + ((manifest as { hOffset?: number }).hOffset || 0),
		marginY: ONE_INCH_PT + ((manifest as { vOffset?: number }).vOffset || 0),
		pages
	};
}
