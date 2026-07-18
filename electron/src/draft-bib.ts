// Keeps the draft compile's BIBLIOGRAPHY fresh between passes -- nothing else.
// Seeds a shipped .bbl under the draft jobname, reruns biber/bibtex only when their
// inputs actually changed, and reports whether the .bbl moved (= the pass is stale).
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

const OUT = '_draft';

// per-root biber control-file hash: biber is slow (~1-3s), so rerun it only when the
// .bcf actually changed (citation set changed), not on every keystroke's recompile
const lastBcf = new Map<string, string>();

function sha1(buf: Buffer | string): string {
	return crypto.createHash('sha1').update(buf).digest('hex');
}
function mtimeOf(p: string): number {
	try {
		return fs.statSync(p).mtimeMs;
	} catch {
		return 0;
	}
}
function run(cmd: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<void> {
	return new Promise((resolve) => {
		const child = execFile(cmd, args, { ...opts, timeout: 90000, maxBuffer: 16 * 1024 * 1024 }, () => resolve());
		child.on('error', () => resolve()); // tool missing -> citations just stay unresolved
	});
}

// arXiv-style papers ship <main>.bbl with no .bib; seed it under our jobname so the
// FIRST pass already processes the bibliography (else cites need a third pass)
export function seedBbl(root: string, outAbs: string, mainFile: string): void {
	const bbl = path.join(outAbs, 'draft.bbl');
	// seed candidates: <main>.bbl (arXiv convention), the \bibliography{NAME} arg's NAME.bbl,
	// or a lone .bbl in the root -- shipped bibliographies don't always follow the jobname
	const cands: string[] = [path.join(root, path.basename(mainFile, '.tex') + '.bbl')];
	try {
		const src = fs.readFileSync(path.join(root, mainFile), 'utf8');
		const m = src.match(/\\bibliography\{([^}]+)\}/);
		if (m) for (const b of m[1].split(',')) cands.push(path.join(root, b.trim() + '.bbl'));
	} catch {
		/* main unreadable -> the compile will fail its own way */
	}
	try {
		const all = fs.readdirSync(root).filter((f) => f.endsWith('.bbl'));
		if (all.length === 1) cands.push(path.join(root, all[0]));
	} catch {
		/* ignore */
	}
	const seed = cands.find((c) => {
		try {
			return fs.statSync(c).size > 0;
		} catch {
			return false;
		}
	});
	if (!seed) return;
	// (re)seed when the draft bbl is absent, empty, gutted (no entries -- e.g. clobbered by a
	// failed bibtex), or older than a regenerated seed
	try {
		const cur = fs.existsSync(bbl) ? fs.statSync(bbl) : null;
		const curOk = !!cur && cur.size > 0 && /\\bibitem|\\entry/.test(fs.readFileSync(bbl, 'utf8'));
		if (curOk && cur!.mtimeMs >= fs.statSync(seed).mtimeMs) return;
		fs.copyFileSync(seed, bbl);
	} catch {
		/* ignore */
	}
}

// The aux cycle (latexmk-lite): run biber (biblatex) when the .bcf changed, or bibtex
// (\bibdata in the aux) when the .bbl is missing/stale. Returns whether the .bbl changed.
export async function auxCycle(root: string, outAbs: string, mainFile: string): Promise<boolean> {
	const bbl = path.join(outAbs, 'draft.bbl');
	const bblBefore = mtimeOf(bbl) + ':' + (fs.existsSync(bbl) ? sha1(fs.readFileSync(bbl)) : '');
	seedBbl(root, outAbs, mainFile);
	const bcf = path.join(outAbs, 'draft.bcf');
	const aux = path.join(outAbs, 'draft.aux');
	const auxText = fs.existsSync(aux) ? fs.readFileSync(aux, 'utf8') : '';
	if (fs.existsSync(bcf)) {
		const h = sha1(fs.readFileSync(bcf));
		if (lastBcf.get(root) !== h) {
			// biblatex: biber reads _draft/draft.bcf; datasource paths in the .bcf are as
			// written in \addbibresource (root-relative), so run from root
			await run('biber', ['--input-directory', OUT, '--output-directory', OUT, 'draft'], { cwd: root });
			lastBcf.set(root, h);
		}
	} else if (/\\bibdata\{/.test(auxText)) {
		// classic bibtex: runs inside the output dir (reads draft.aux there); .bib/.bst
		// live in the project root, reachable via BIBINPUTS/BSTINPUTS (trailing separator
		// keeps the default search paths)
		const bibs = fs
			.readdirSync(root)
			.filter((f) => f.endsWith('.bib'))
			.map((f) => mtimeOf(path.join(root, f)));
		const stale = !fs.existsSync(bbl) || (bibs.length > 0 && Math.max(...bibs) > mtimeOf(bbl));
		if (stale && bibs.length > 0) {
			const prev = fs.existsSync(bbl) ? fs.readFileSync(bbl) : null;
			await run('bibtex', ['draft'], {
				cwd: outAbs,
				env: { ...process.env, BIBINPUTS: root + path.delimiter, BSTINPUTS: root + path.delimiter }
			});
			// a failed bibtex (missing .bst, broken .bib) can leave an empty/gutted bbl and the
			// mtime guards would then keep it forever: never let it clobber a working one
			const ok = fs.existsSync(bbl) && /\\bibitem/.test(fs.readFileSync(bbl, 'utf8'));
			if (!ok && prev && /\\bibitem/.test(prev.toString())) {
				try {
					fs.writeFileSync(bbl, prev);
				} catch {
					/* ignore */
				}
			}
		}
	}
	const bblAfter = mtimeOf(bbl) + ':' + (fs.existsSync(bbl) ? sha1(fs.readFileSync(bbl)) : '');
	return bblAfter !== bblBefore;
}
