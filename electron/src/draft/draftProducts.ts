// What a draft engine reads and writes besides the source: the seed files it reads at \begin{document}, the products
// a compile promotes to _draft, and the page records the renderer draws.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { resolveType1Line } from '../fontT1Map';
import { allowPreviewFile } from './previewFiles';

// the products the engine READS by \jobname, from the renderer's package data: byTex are written by the engine itself
// (aux, toc, the float lists), byTools by another program (bbl, ind), which draftBib keeps in _draft
export type ReadBackFiles = { byTex: string[]; byTools: string[] };

export type DraftPage = { n: number; w: number; h: number; unc?: string; records: string };

/** an \include's chapter .aux lives in the folder mirroring the chapter's */
function auxUnder(dirAbs: string, root: string, rel = ''): string[] {
	const out: string[] = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(path.join(dirAbs, rel), { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const r = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory()) {
			if (fs.existsSync(path.join(root, r))) out.push(...auxUnder(dirAbs, root, r));
		} else if (rel && e.name.endsWith('.aux')) out.push(r);
	}
	return out;
}

/** the seed files as _draft holds them now, kept in a folder named for their content */
export function collectSeeds(root: string, outAbs: string, readBack: ReadBackFiles): string {
	const files = [...readBack.byTex, ...readBack.byTools].map((ext) => `draft.${ext}`).filter((f) => fs.existsSync(path.join(outAbs, f)));
	files.push(...auxUnder(outAbs, root));
	files.sort();
	const hash = crypto.createHash('sha1');
	for (const f of files)
		hash
			.update(f)
			.update('\0')
			.update(fs.readFileSync(path.join(outAbs, f)))
			.update('\0');
	const dir = path.join(outAbs, 'seeds', hash.digest('hex').slice(0, 16));
	if (!fs.existsSync(dir)) {
		const staging = `${dir}.part`;
		fs.rmSync(staging, { recursive: true, force: true });
		for (const f of files) {
			fs.mkdirSync(path.dirname(path.join(staging, f)), { recursive: true });
			fs.copyFileSync(path.join(outAbs, f), path.join(staging, f));
		}
		fs.mkdirSync(staging, { recursive: true });
		fs.renameSync(staging, dir);
	}
	return dir;
}

/** a finished pass's products become _draft's: the PDF, log, synctex, aux files and the page records */
export function promote(engineAbs: string, outAbs: string, root: string, readBack: ReadBackFiles): void {
	for (const f of fs.readdirSync(outAbs))
		if (/^page-\d+\.jsonl$/.test(f) || f === 'pages.json') fs.rmSync(path.join(outAbs, f), { force: true });
	const appOwned = new Set(readBack.byTools.map((ext) => `draft.${ext}`));
	for (const f of fs.readdirSync(engineAbs)) {
		if (appOwned.has(f)) continue;
		if (f.startsWith('draft.') || /^page-\d+\.jsonl$/.test(f) || f === 'pages.json') {
			try {
				fs.copyFileSync(path.join(engineAbs, f), path.join(outAbs, f));
			} catch {
				/* a locked file costs that one product, not the compile */
			}
		}
	}
	for (const r of auxUnder(engineAbs, root)) {
		fs.mkdirSync(path.dirname(path.join(outAbs, r)), { recursive: true });
		fs.copyFileSync(path.join(engineAbs, r), path.join(outAbs, r));
	}
}

/** a page's records with each image's file made absolute and each Type1 font's sources found */
export async function readPage(dirAbs: string, root: string, n: number, w: number, h: number, unc?: string): Promise<DraftPage> {
	let records = '';
	try {
		records = fs.readFileSync(path.join(dirAbs, `page-${String(n).padStart(3, '0')}.jsonl`), 'utf8');
	} catch {
		/* a page the engine could not write draws empty */
	}
	if (records.includes('"t":"image"') || records.includes('"t":"font"')) {
		const lines = records.split('\n');
		await Promise.all(
			lines.map(async (ln, i) => {
				if (ln.startsWith('{"t":"font"')) lines[i] = await resolveType1Line(ln);
				else if (ln.startsWith('{"t":"image"') && ln.includes('"file"')) {
					const r = JSON.parse(ln);
					r.file = (path.isAbsolute(r.file) ? r.file : path.join(root, r.file)).replace(/\\/g, '/');
					allowPreviewFile(r.file);
					lines[i] = JSON.stringify(r);
				}
			})
		);
		records = lines.join('\n');
	}
	return { n, w, h, ...(unc ? { unc } : {}), records };
}
