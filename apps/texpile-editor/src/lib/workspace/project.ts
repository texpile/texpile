// multi-file support: pick the main entry .tex and gather macro-defining text from its preamble
// include-chain, so fragments can round-trip custom commands whose signatures live in the main
// file. signature scanning only, never written back to disk. `read` is injectable so a shared
// session resolves through the workspace provider instead of the disk.
import { readTextFile, dirname, joinPath, pathKey, type TexFile } from './fileSystem';
import { documentStart, hasDocumentEnv } from './latexRoundtrip';
import { withoutComments } from '$lib/languages/latex/intellisense/packages/packageUses';
import { isBundled } from '$lib/languages/latex/knowledge/bundledFiles';
import { fileIdOf } from '$lib/languages/latex/knowledge/fileIds';
import { fileCallsIn, namesTried } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { includePaths, readFirst, texIncludesIn } from './document/texIncludes';

type ReadFn = (path: string) => Promise<string>;

/** everything before \begin{document}; the whole string if there is none. */
function preambleOf(text: string): string {
	const at = documentStart(text);
	return at >= 0 ? text.slice(0, at) : text;
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

type LoaderUse = { name: string; role: 'package' | 'class'; options: string; names: string[] };

// the options sit in the [..] before the name
function loaderUsesIn(code: string): LoaderUse[] {
	return fileCallsIn(code, ['package', 'class']).flatMap((call) =>
		call.args
			.filter((a) => a.arg.loads)
			.flatMap((a) => {
				const role = rolesOf(a.arg).includes('class') ? 'class' : 'package';
				const options = /\[([^\]]*)\]/.exec(code.slice(call.at + call.command.length + 1, a.values[0]?.at ?? call.at))?.[1] ?? '';
				return a.values.map((v) => ({ name: v.value, role, options: options.trim(), names: namesTried(a.arg, v.value) }));
			})
	);
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

		const code = withoutComments(scan);
		const uses = loaderUsesIn(code);
		const folders = [dirname(filePath), root];
		const reads: { paths: string[]; package?: LoaderUse }[] = texIncludesIn(code).map((include) => ({
			paths: includePaths(include, dirname(filePath), folders)
		}));
		for (const use of uses.filter((u) => u.role === 'package'))
			reads.push({ package: use, paths: use.names.flatMap((name) => folders.map((dir) => joinPath(dir, name))) });

		for (const { paths, package: use } of reads) {
			// a copy of a package with data is read from the data (algorithmic.sty stalls the preamble scan)
			if (use && isBundled(fileIdOf(use.name))) continue;
			const got = await readFirst(paths, read);
			if (!got) continue;
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
