// the files a document is made of, in the order TeX or Typst reads them
import { dirname, joinPath, normalizePath, pathKey, samePath } from '../fileSystem';
import { documentSources } from './documentSources';
import { includePaths, texIncludesIn } from './texIncludes';
import { codeOnly } from '$lib/languages/latex/texCode';
import { fileCallsIn, namesTried } from '$lib/languages/latex/knowledge/calls/fileCommands';

export type DocFile = { path: string; text: string; missing?: undefined } | { path: string; text?: undefined; missing: true };

export type Read = (path: string) => Promise<string>;

/** one file, however its path is spelled (separators, case, dot segments) */
function fileKey(path: string): string {
	return pathKey(normalizePath(path));
}

const TYPST_INCLUDE = /#include\s+"([^"]+)"/g;

function isTypst(path: string): boolean {
	return /\.typ$/i.test(path);
}

function isTex(path: string): boolean {
	return !isTypst(path) && !/\.(sty|cls)$/i.test(path);
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
	return texIncludesIn(tex).map((include) => includePaths(include, dirname(path), [dirname(main), dirname(path), root]));
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

/** the main file's document when it brings `path` in (its preamble's files too), else the one `path` starts, else null */
export async function documentAround(
	path: string,
	main: string | null,
	root: string,
	read: Read
): Promise<{ main: string; files: DocFile[] } | null> {
	if (main && /\.(tex|typ)$/i.test(main)) {
		const files = await documentFiles(main, root, read).catch(() => null);
		if (files?.some((f) => !f.missing && samePath(f.path, path))) return { main, files };
		// the main file's preamble brings in macros, not text, so documentFiles leaves the files it reads out
		const sources = files && isTex(path) ? await documentSources(main, root, read) : null;
		if (files && sources?.files.some((f) => isTex(f.path) && samePath(f.path, path))) {
			const extra = sources.files.filter((f) => isTex(f.path) && !files.some((g) => samePath(g.path, f.path)));
			return { main, files: [files[0], ...extra.map((f) => ({ path: f.path, text: f.text })), ...files.slice(1)] };
		}
	}
	if (!isTypst(path) && !/\\begin\s*\{document\}/.test(codeOnly(await read(path)))) return null;
	return { main: path, files: await documentFiles(path, root, read) };
}

const TYPST_BIB = /bibliography\s*\(\s*\(?([^)]*)\)/g;

function baseName(path: string): string {
	return (path.split(/[\\/]/).pop() ?? '').toLowerCase();
}

/** the file names the bibliography commands of `tex` could mean, lower-cased; the name as written counts too */
function bibNamesIn(tex: string): string[] {
	return fileCallsIn(tex, ['bibfile'])
		.flatMap((call) => call.args.flatMap((a) => a.values.flatMap((v) => [...namesTried(a.arg, v.value), v.value])))
		.map(baseName);
}

export function namesBibliography(files: DocFile[], bib: string): boolean {
	const want = baseName(bib);
	return files.some((f) => {
		if (f.missing) return false;
		const code = codeOnly(f.text);
		const typst = [...code.matchAll(TYPST_BIB)].flatMap((m) => m[1].split(',').map((n) => n.replace(/["\s]/g, '')));
		return [...bibNamesIn(code), ...typst.map(baseName)].includes(want);
	});
}
