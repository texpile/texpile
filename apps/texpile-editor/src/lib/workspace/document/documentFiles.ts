// the files a document is made of, in the order TeX or Typst reads them
import { dirname, joinPath, normalizePath, pathKey, samePath } from '../fileSystem';
import { codeOnly } from '$lib/languages/latex/texCode';

export type DocFile = { path: string; text: string; missing?: undefined } | { path: string; text?: undefined; missing: true };

export type Read = (path: string) => Promise<string>;

/** one file, however its path is spelled (separators, case, dot segments) */
function fileKey(path: string): string {
	return pathKey(normalizePath(path));
}

const LATEX_INCLUDE = /\\(?:input|include|subfile|subfileinclude)\s*\{([^}]+)\}/g;
const LATEX_IMPORT = /\\(sub)?(?:import|inputfrom|includefrom)\*?\s*\{([^}]*)\}\s*\{([^}]+)\}/g;
const TYPST_INCLUDE = /#include\s+"([^"]+)"/g;

function withTex(name: string): string {
	return /\.[A-Za-z0-9]+$/.test(name.trim()) ? name.trim() : `${name.trim()}.tex`;
}

function isTypst(path: string): boolean {
	return /\.typ$/i.test(path);
}

/** the files `text` brings in, as candidate paths to try in turn */
function includesOf(path: string, text: string, main: string, root: string): string[][] {
	if (isTypst(path)) return [...text.matchAll(TYPST_INCLUDE)].map((m) => [joinPath(dirname(path), m[1])]);
	let tex = codeOnly(text);
	// a main file's preamble \input reads macros, not text
	if (samePath(path, main)) {
		const begin = /\\begin\s*\{document\}/.exec(tex);
		if (begin) tex = tex.slice(begin.index);
	}
	const found: { at: number; tries: string[] }[] = [];
	for (const m of tex.matchAll(LATEX_INCLUDE)) {
		const ref = withTex(m[1]);
		found.push({ at: m.index ?? 0, tries: [joinPath(dirname(main), ref), joinPath(dirname(path), ref), joinPath(root, ref)] });
	}
	for (const m of tex.matchAll(LATEX_IMPORT)) {
		// \subimport is named from the file it is in, \import from where TeX runs
		const base = m[1] ? dirname(path) : dirname(main);
		found.push({ at: m.index ?? 0, tries: [joinPath(joinPath(base, m[2]), withTex(m[3]))] });
	}
	return found.sort((a, b) => a.at - b.at).map((f) => f.tries);
}

/** `read` throws for a file that is not there, which is then listed as missing */
export async function documentFiles(main: string, root: string, read: Read): Promise<DocFile[]> {
	const files: DocFile[] = [];
	const seen = new Set<string>();

	async function visit(path: string, text: string, depth: number): Promise<void> {
		files.push({ path, text });
		if (depth >= 20) return;
		for (const tries of includesOf(path, text, main, root)) {
			const unique = tries.map(normalizePath).filter((p, i, all) => all.findIndex((q) => samePath(p, q)) === i);
			if (unique.some((p) => seen.has(fileKey(p)))) continue;
			let got: { path: string; text: string } | null = null;
			for (const p of unique) {
				try {
					got = { path: p, text: await read(p) };
					break;
				} catch {
					/* the next place TeX would look */
				}
			}
			if (!got) {
				seen.add(fileKey(unique[0]));
				files.push({ path: unique[0], missing: true });
				continue;
			}
			seen.add(fileKey(got.path));
			await visit(got.path, got.text, depth + 1);
		}
	}

	seen.add(fileKey(main));
	await visit(main, await read(main), 0);
	return files;
}

/** the main file's document when it brings `path` in, else the one `path` starts, else null */
export async function documentAround(
	path: string,
	main: string | null,
	root: string,
	read: Read
): Promise<{ main: string; files: DocFile[] } | null> {
	if (main && /\.(tex|typ)$/i.test(main)) {
		const files = await documentFiles(main, root, read).catch(() => null);
		if (files?.some((f) => !f.missing && samePath(f.path, path))) return { main, files };
	}
	if (!isTypst(path) && !/\\begin\s*\{document\}/.test(codeOnly(await read(path)))) return null;
	return { main: path, files: await documentFiles(path, root, read) };
}

const BIB_NAMES = /\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}|bibliography\s*\(\s*\(?([^)]*)\)/g;

export function namesBibliography(files: DocFile[], bib: string): boolean {
	const want = bibName(bib);
	return files.some(
		(f) =>
			!f.missing &&
			[...codeOnly(f.text).matchAll(BIB_NAMES)].some((m) =>
				(m[1] ?? m[2]).split(',').some((n) => bibName(n.replace(/["\s]/g, '')) === want)
			)
	);
}

function bibName(path: string): string {
	return (path.split(/[\\/]/).pop() ?? '').replace(/\.bib$/i, '').toLowerCase();
}
