// multi-file support: pick the main entry .tex and gather macro-defining text from its preamble
// include-chain, so fragments can round-trip custom commands whose signatures live in the main
// file. signature scanning only, never written back to disk. `read` is injectable so a shared
// session resolves through the workspace provider instead of the disk.
import { readTextFile, dirname, joinPath, pathKey, type TexFile } from './fileSystem';
import { hasDocumentEnv } from './latexRoundtrip';

type ReadFn = (path: string) => Promise<string>;

const BEGIN_DOC = /\\begin\s*\{document\}/;

/** everything before \begin{document}; the whole string if there is none. */
function preambleOf(text: string): string {
	const m = BEGIN_DOC.exec(text);
	return m ? text.slice(0, m.index) : text;
}

/** picks the main entry .tex: conventional names first, else the shallowest file with a real \begin{document}. */
export async function detectMainFile(files: TexFile[], read: ReadFn = readTextFile): Promise<string | null> {
	if (files.length === 0) return null;
	if (files.length === 1) return files[0].path;

	const FAVOURITES = ['main.tex', 'paper.tex', 'root.tex', 'ms.tex', 'manuscript.tex', 'article.tex', 'thesis.tex'];

	// Typst has no \begin{document} equivalent - any .typ compiles - so the marker scan below can
	// never identify a root among them. Handle them by name/depth instead, and only when the folder
	// has no .tex at all, so a LaTeX project with a stray .typ still resolves the LaTeX way.
	const typ = files.filter((f) => /\.typ$/i.test(f.path));
	if (typ.length > 0 && typ.length === files.length) {
		const TYP_FAVOURITES = ['main.typ', 'paper.typ', 'thesis.typ', 'report.typ'];
		for (const fav of TYP_FAVOURITES) {
			const hit = typ.find((f) => f.name.toLowerCase() === fav);
			if (hit) return hit.path;
		}
		const sorted = [...typ].sort(
			(a, b) => a.relPath.split(/[\\/]/).length - b.relPath.split(/[\\/]/).length || a.relPath.length - b.relPath.length
		);
		return sorted[0].path;
	}

	// read every file once, project folders are small
	const scanned = await Promise.all(
		files.map(async (f) => {
			try {
				return { f, hasDoc: hasDocumentEnv(await read(f.path)) };
			} catch {
				return { f, hasDoc: false };
			}
		})
	);
	const roots = scanned.filter((s) => s.hasDoc).map((s) => s.f);
	if (roots.length === 0) return files[0].path; // no document root, fall back to the first

	for (const fav of FAVOURITES) {
		const hit = roots.find((r) => r.name.toLowerCase() === fav);
		if (hit) return hit.path;
	}
	// shallowest then shortest, for a deterministic choice
	roots.sort((a, b) => a.relPath.split(/[\\/]/).length - b.relPath.split(/[\\/]/).length || a.relPath.length - b.relPath.length);
	return roots[0].path;
}

/** the subset of files with a real \begin{document}: not commented out, not quoted. */
export async function findDocRoots(files: TexFile[]): Promise<Set<string>> {
	const out = new Set<string>();
	await Promise.all(
		files.map(async (f) => {
			try {
				if (hasDocumentEnv(await readTextFile(f.path))) out.add(f.path);
			} catch {
				/* unreadable, not a root */
			}
		})
	);
	return out;
}

// macro-bearing refs followed out of a preamble; a standard package won't resolve
// to a project-local file and is skipped
const INCLUDE_RE = /\\(?:input|include|subfile|subfileinclude)\s*\{([^}]+)\}/g;
const PKG_RE = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;

/** resolves a reference against a base dir, trying extensions; the first that reads wins. */
async function resolveRead(baseDir: string, ref: string, exts: string[], read: ReadFn): Promise<{ path: string; text: string } | null> {
	const cand = ref.trim().replace(/\\/g, '/');
	if (!cand) return null;
	const tries = /\.[a-z]+$/i.test(cand) ? [cand] : exts.map((e) => cand + e);
	for (const rel of tries) {
		const path = joinPath(baseDir, rel);
		try {
			return { path, text: await read(path) };
		} catch {
			/* try the next candidate */
		}
	}
	return null;
}

/**
 * Collects macro-defining text reachable from the main file's preamble include-chain, cycle-
 * and depth-guarded. Only the main file is restricted to its preamble (its body-level \input
 * would drag in whole sections); fragments are scanned whole. Over-gathering is harmless,
 * the result feeds signature scanning only.
 */
export async function gatherProjectMacros(mainFilePath: string, root: string, read: ReadFn = readTextFile): Promise<string> {
	const seen = new Set<string>();
	const chunks: string[] = [];

	async function walk(filePath: string, text: string, depth: number): Promise<void> {
		// fragments have no \begin{document}, so preambleOf returns the whole file
		const scan = preambleOf(text);
		chunks.push(scan);
		if (depth >= 6) return;

		const refs: { ref: string; exts: string[] }[] = [];
		for (const m of scan.matchAll(INCLUDE_RE)) refs.push({ ref: m[1], exts: ['.tex'] });
		for (const m of scan.matchAll(PKG_RE)) for (const name of m[1].split(',')) refs.push({ ref: name, exts: ['.sty', '.cls'] });

		for (const { ref, exts } of refs) {
			// referrer's own dir first, then the project root
			const got = (await resolveRead(dirname(filePath), ref, exts, read)) ?? (await resolveRead(root, ref, exts, read));
			if (!got) continue; // standard package or missing file
			const key = pathKey(got.path);
			if (seen.has(key)) continue;
			seen.add(key);
			await walk(got.path, got.text, depth + 1);
		}
	}

	try {
		const text = await read(mainFilePath);
		seen.add(pathKey(mainFilePath));
		await walk(mainFilePath, text, 0);
	} catch {
		return ''; // main file unreadable, fall back to per-file preamble scanning
	}
	return chunks.join('\n');
}
