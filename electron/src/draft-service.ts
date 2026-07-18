// Runs ONE full engine compile of the user's main file and returns its pages -- nothing
// else. The job string injects the page-extract.lua shipout hook (contained in _draft/,
// source never touched); the result is the engine's manifest + per-page records, with
// image filenames (draft-images) and Type1 font paths (font-t1map) attached, the
// bibliography cycled between passes (draft-bib), and refs exported for the warm daemon
// (draft-refs). Same engine as the user's own compile, so exact by construction.
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { resolveType1Line } from './font-t1map';
import { seedBbl, auxCycle } from './draft-bib';
import { exportDaemonRefs } from './draft-refs';
import { readImageUses, attachImageFiles } from './draft-images';

// ht = the shipout box HEIGHT = distance from box top to the box baseline, which is the
// FOOTER line's baseline -- the renderer uses it to keep bottom-anchored footers out of
// patch shifts (h additionally includes the box depth below that baseline)
export type DraftPage = { n: number; w: number; h: number; ht?: number; records: string };
export type DraftResult =
	| {
			ok: true;
			ms: number;
			count: number;
			passes: number;
			paperW: number;
			paperH: number;
			colW: number;
			footSkip: number;
			marginX: number;
			marginY: number;
			pages: DraftPage[];
	  }
	| { ok: false; error: string; ms: number; log?: string; superseded?: true };

type DraftBody = { root: string; mainFile: string; engineDir: string; engine?: string };

const OUT = '_draft';

// Cancel-on-supersede: a newer compileDraft kills the in-flight lualatex (via activeChild) so a
// hung/slow compile can't hold the 120s pass timeout and stick the preview -- the editor just
// fires the fresh compile and the stale one bails. compileGen is the monotonic run id; a run is
// superseded once compileGen moves past it.
let compileGen = 0;
let activeChild: import('node:child_process').ChildProcess | null = null;

// TeX places the shipped page's reference point 1in (72.27pt) from the paper's top-left
// by default; the extracted box coords are relative to that point.
const ONE_INCH_PT = 72.27;

export async function compileDraft(body: DraftBody): Promise<DraftResult> {
	const { root, mainFile } = body;
	const engineDir = body.engineDir.replace(/\\/g, '/');
	const engine = body.engine || 'lualatex';
	const outAbs = path.join(root, OUT);
	// supersede any in-flight compile: kill its lualatex so this fresh run isn't stuck behind it
	const gen = ++compileGen;
	if (activeChild) {
		try {
			activeChild.kill('SIGKILL');
		} catch {
			/* already gone */
		}
		activeChild = null;
	}
	const superseded = () => gen !== compileGen;
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
		if (/^page-\d+\.jsonl$/.test(f) || f === 'pages.json') {
			try {
				fs.rmSync(path.join(outAbs, f));
			} catch {
				/* ignore */
			}
		}

	// forward-slash the input path for TeX; keep it relative to the compile cwd (root)
	const mainRel = mainFile.replace(/\\/g, '/');
	const setup = `\\directlua{TEXPILE_ENGINE_DIR='${engineDir}'; TEXPILE_DRAFT_OUT='${OUT}'; dofile('${engineDir}/page-extract.lua')}`;
	const hooks = `\\AtBeginDocument{\\AddToHook{shipout/before}{\\directlua{page_extract(\\the\\ShipoutBox)}}\\AtEndDocument{\\directlua{page_extract_finish()}}}`;
	// \pdfoutput is a pdfTeX primitive luatex lacks; many arXiv preambles set it unguarded
	// (\pdfoutput=1) and crash lualatex. Define it as a dummy count if absent so the assignment
	// is a harmless no-op. Injected before \input so it runs before the main preamble; a no-op
	// for docs that never touch it (only defines what isn't there). See PDF_SHIM in draft-daemon.
	const pdfShim = `\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi`;
	const job = `${setup}${hooks}${pdfShim}\\input{${mainRel}}`;
	const enginePass = () =>
		new Promise<void>((resolve) => {
			if (superseded()) {
				resolve();
				return;
			} // a newer compile already took over
			const child = execFile(
				engine,
				// -synctex=1 so the instant path can map a source line to its page box (draft.synctex.gz)
				['-no-shell-escape', '-interaction=nonstopmode', '-synctex=1', `-output-directory=${OUT}`, '-jobname=draft', job],
				{ cwd: root, timeout: 120000, maxBuffer: 32 * 1024 * 1024 },
				() => {
					if (activeChild === child) activeChild = null;
					resolve();
				}
			);
			activeChild = child; // a superseding compile kills this to unblock itself
			child.on('error', () => {
				if (activeChild === child) activeChild = null;
				resolve();
			}); // engine not on PATH etc -> handled by the manifest check below
		});

	const t0 = Date.now();
	const auxExisted = fs.existsSync(path.join(outAbs, 'draft.aux'));
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
	exportDaemonRefs(outAbs);
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

	let manifest: { count: number; paperW?: number; paperH?: number; colW?: number; pages: { n: number; w: number; h: number }[] };
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	} catch (e) {
		return { ok: false, error: 'Draft manifest unreadable: ' + (e instanceof Error ? e.message : String(e)), ms };
	}

	const imageUses = readImageUses(outAbs);
	const pages: DraftPage[] = [];
	for (let n = 1; n <= manifest.count; n++) {
		const p = path.join(outAbs, `page-${String(n).padStart(3, '0')}.jsonl`);
		const meta = manifest.pages[n - 1] || { w: 0, h: 0 };
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
		pages.push({ n, w: meta.w, h: meta.h, ht: (meta as { ht?: number }).ht, records });
	}

	// some classes never set the engine's page-dimension registers, leaving paperW/H = 0 in the
	// manifest (the preview would render zero-sized pages): fall back to the shipped page BOX
	// dims (always known at shipout) plus the 1in reference margins
	const maxPageW = manifest.pages.length ? Math.max(...manifest.pages.map((p) => p.w || 0)) : 0;
	const maxPageH = manifest.pages.length ? Math.max(...manifest.pages.map((p) => p.h || 0)) : 0;
	return {
		ok: true,
		ms,
		passes,
		count: manifest.count,
		paperW: manifest.paperW || (maxPageW ? maxPageW + 2 * ONE_INCH_PT : 0),
		paperH: manifest.paperH || (maxPageH ? maxPageH + 2 * ONE_INCH_PT : 0),
		colW: manifest.colW || 0,
		footSkip: (manifest as { footSkip?: number }).footSkip || 0,
		marginX: ONE_INCH_PT,
		marginY: ONE_INCH_PT,
		pages
	};
}
