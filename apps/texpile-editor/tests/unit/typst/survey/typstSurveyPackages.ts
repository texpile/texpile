// a folder laid out as Typst's package cache, read as the app reads the user's: each package's files by path
import fs from 'node:fs';
import path from 'node:path';
import { packageSpecOf, type PackageCacheReader } from '$lib/languages/typst/knowledge';
import { detectMainFile } from '$lib/workspace/project';
import type { ProjectFiles } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

function filesUnder(dir: string, root = dir): Array<[string, string]> {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e): Array<[string, string]> => {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) return filesUnder(full, root);
		return /\.(typ|toml)$/.test(e.name) ? [[path.relative(root, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8')]] : [];
	});
}

/** the main file the app picks among a paper's files */
export async function mainFileOf(dir: string, files: string[]): Promise<string | null> {
	const rel = files.map((file) => path.relative(dir, file).split(path.sep).join('/'));
	return detectMainFile(rel.map((r) => ({ name: r.split('/').pop()!, path: r, relPath: r })));
}

/** a paper's folder as the project its file reads local modules from */
export function projectAt(dir: string, file: string, main: string | null = null): ProjectFiles {
	return {
		path: path.relative(dir, file).split(path.sep).join('/'),
		main,
		read: async (at) => {
			const full = path.join(dir, at);
			return full.startsWith(dir) && fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
		}
	};
}

export function packageCacheAt(root: string): PackageCacheReader {
	return async (spec) => {
		const parsed = packageSpecOf(spec);
		const dir = parsed && path.join(root, parsed.namespace, parsed.name, parsed.version);
		return dir && fs.existsSync(dir) ? Object.fromEntries(filesUnder(dir)) : null;
	};
}
