// data folder first (local packages), then the download cache
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';

const SPEC = /^@([a-z0-9][\w-]*)\/([a-z0-9][\w-]*):(\d+\.\d+\.\d+)$/i;
const MOST_FILES = 400;
const MOST_BYTES = 8 * 1024 * 1024;

function packageFolders(): string[] {
	const home = homedir();
	const env = process.env;
	if (process.platform === 'win32') {
		const roaming = env.APPDATA ?? join(home, 'AppData', 'Roaming');
		const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
		return [env.TYPST_PACKAGE_PATH ?? join(roaming, 'typst', 'packages'), env.TYPST_PACKAGE_CACHE_PATH ?? join(local, 'typst', 'packages')];
	}
	if (process.platform === 'darwin') {
		const library = join(home, 'Library');
		return [
			env.TYPST_PACKAGE_PATH ?? join(library, 'Application Support', 'typst', 'packages'),
			env.TYPST_PACKAGE_CACHE_PATH ?? join(library, 'Caches', 'typst', 'packages')
		];
	}
	return [
		env.TYPST_PACKAGE_PATH ?? join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'typst', 'packages'),
		env.TYPST_PACKAGE_CACHE_PATH ?? join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'typst', 'packages')
	];
}

async function sourcesUnder(root: string): Promise<Record<string, string> | null> {
	const out: Record<string, string> = {};
	let files = 0;
	let bytes = 0;
	async function walk(dir: string): Promise<boolean> {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!(await walk(full))) return false;
			} else if (entry.isFile() && /\.(typ|toml)$/.test(entry.name)) {
				const text = await fs.readFile(full, 'utf8');
				bytes += text.length;
				if (++files > MOST_FILES || bytes > MOST_BYTES) return false;
				out[relative(root, full).split(sep).join('/')] = text;
			}
		}
		return true;
	}
	return (await walk(root)) ? out : null;
}

/** the package's .typ files and typst.toml by path from its root; null when no folder holds it */
export async function readTypstPackage(spec: string): Promise<Record<string, string> | null> {
	const m = SPEC.exec(spec);
	if (!m) return null;
	for (const folder of packageFolders()) {
		const root = join(folder, m[1], m[2], m[3]);
		const found = await fs.stat(join(root, 'typst.toml')).catch(() => null);
		if (found?.isFile()) return sourcesUnder(root).catch(() => null);
	}
	return null;
}
