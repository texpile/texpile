// every TeX file a document reads, the ones its preambles bring in and the .sty and .cls files in the folder too
import { definedNamesIn, mergeDefinedNames, type DefinedNames } from '$lib/languages/latex/intellisense/checks/reading/definedNames';
import { isBundled } from '$lib/languages/latex/knowledge/bundledFiles';
import { fileIdOf } from '$lib/languages/latex/knowledge/fileIds';
import { packageUseSitesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import { codeOnly } from '$lib/languages/latex/texCode';
import { dirname, joinPath, normalizePath, pathKey, samePath } from '../fileSystem';
import { includePaths, readFirst, texIncludesIn } from './texIncludes';

const DEEPEST = 20;

/** where a file brought in stands in the file that brings it in: an include by its name, a package by its use name */
export function readKey(kind: 'include' | 'package', name: string): string {
	return `${kind}:${name}`;
}

/** reads: the path of each file it brings in, by readKey; library: a .sty or .cls the folder holds */
export type SourceFile = { path: string; text: string; reads: ReadonlyMap<string, string>; library: boolean };

/** complete: false when a file the document brings in cannot be read or named, since it may load or define anything; local: the
 * names of the packages and classes whose .sty or .cls was read from the folder */
export type DocumentSources = { files: SourceFile[]; complete: boolean; local: ReadonlySet<string> };

export async function documentSources(
	main: string,
	root: string,
	read: (path: string) => Promise<string>
): Promise<DocumentSources | null> {
	const files: SourceFile[] = [];
	const seen = new Map([[pathKey(normalizePath(main)), normalizePath(main)]]);
	const local = new Set<string>();
	let complete = true;
	async function bring(tries: string[], reads: Map<string, string>, key: string): Promise<string | null> {
		const known = tries.find((p) => seen.has(pathKey(p)));
		if (known) {
			reads.set(key, seen.get(pathKey(known))!);
			return null;
		}
		const got = await readFirst(tries, read);
		if (!got) return null;
		seen.set(pathKey(normalizePath(got.path)), got.path);
		reads.set(key, got.path);
		return got.text;
	}
	async function visit(path: string, source: string, depth: number, library = false): Promise<void> {
		// a lone carriage return ends a line for TeX; the same length keeps every offset
		const text = source.replace(/\r(?!\n)/g, '\n');
		const reads = new Map<string, string>();
		files.push({ path, text, reads, library });
		if (/\.typ$/i.test(path)) return;
		// a package or class the folder holds that names what it loads by a macro may load anything
		if (library && packageUseSitesIn(text).some((use) => /[\\#]/.test(use.name))) complete = false;
		const bases = [dirname(main), dirname(path), root];
		for (const include of texIncludesIn(codeOnly(text))) {
			if (/[\\#]/.test(include.name) || depth >= DEEPEST) {
				complete = false;
				continue;
			}
			const tries = includePaths(include, dirname(path), bases).map(normalizePath);
			const key = readKey('include', include.name);
			const got = await bring(tries, reads, key);
			if (got !== null) await visit(reads.get(key)!, got, depth + 1);
			else if (!reads.has(key)) complete = false;
		}
		// a package with data is read from there; one the folder ships is read from its file
		for (const use of packageUseSitesIn(text)) {
			if (!use.file || isBundled(fileIdOf(use.name)) || depth >= DEEPEST) continue;
			const tries = [...new Set(bases.map((b) => normalizePath(joinPath(b, use.file!))))];
			const key = readKey('package', use.name);
			const got = await bring(tries, reads, key);
			if (got !== null) {
				local.add(use.name);
				await visit(reads.get(key)!, got, depth + 1, true);
			} else if (reads.has(key)) local.add(use.name);
		}
	}
	try {
		await visit(main, await read(main), 0);
	} catch {
		return null;
	}
	return { files, complete, local };
}

/** what the document's files define besides the open one; null when its sources are not all known */
export function definedBesides(sources: DocumentSources | null, open: string): DefinedNames | null {
	if (!sources?.complete) return null;
	return mergeDefinedNames(sources.files.filter((f) => !samePath(f.path, open)).map((f) => definedNamesIn(f.text)));
}
