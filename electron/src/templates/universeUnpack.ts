// A Typst Universe template, unpacked here: the package's tarball from packages.typst.org, and the
// folder its typst.toml names under [template] copied into a staging folder as is. This is what
// tinymist.doInitTemplate does, done in main because tinymist 0.15.8 panics on Windows partway
// through it (the template's own paths keep their backslashes) and the request never answers.
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { tarCommand } from '../tinymist/tinymistArchive';
import { packageUrl } from './typstUniverse';

const DOWNLOAD_TIMEOUT_MS = 120_000;
const EXTRACT_TIMEOUT_MS = 60_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type TemplateManifest = { path: string; entrypoint: string };

function stringKey(table: string, name: string): RegExpExecArray | null {
	return new RegExp(`^\\s*${name}\\s*=\\s*(?:"([^"\\\\]*)"|'([^']*)')`, 'm').exec(table);
}

/** the [template] table of a package's typst.toml; null when the package is not a template */
export function templateManifest(toml: string): TemplateManifest | null {
	const table = /^\s*\[template\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m.exec(toml)?.[1];
	if (table === undefined) return null;
	const path = stringKey(table, 'path');
	const entrypoint = stringKey(table, 'entrypoint');
	if (!path || !entrypoint) return null;
	return { path: path[1] ?? path[2], entrypoint: entrypoint[1] ?? entrypoint[2] };
}

/** `rel` under `base`, or null when it climbs out; manifest paths are written with forward slashes */
function inside(base: string, rel: string): string | null {
	const full = resolve(base, ...rel.split('/'));
	return full === base || full.startsWith(base + sep) ? full : null;
}

function untar(archive: string, into: string): Promise<void> {
	return new Promise((done, fail) => {
		execFile(
			tarCommand(process.platform, process.env),
			['-xzf', archive, '-C', into],
			{ timeout: EXTRACT_TIMEOUT_MS, windowsHide: true },
			(err, _out, stderr) => (err ? fail(new Error(String(stderr).trim().split(/\r?\n/)[0] || err.message)) : done())
		);
	});
}

/** download `name`:`version` and copy its template into the empty folder `dir`; resolves to the entry file, relative to `dir` */
export async function unpackUniverseTemplate(
	fetch: Fetch,
	userAgent: string,
	name: unknown,
	version: unknown,
	dir: string
): Promise<{ entryPath: string }> {
	const url = packageUrl(name, version);
	if (!url) throw new Error('Unknown template.');
	let res: Response;
	try {
		res = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
	} catch (e) {
		throw new Error(`failed to download package (${e instanceof Error ? e.message : String(e)})`, { cause: e });
	}
	if (!res.ok) throw new Error(`failed to download package (HTTP ${res.status})`);
	const work = await mkdtemp(join(tmpdir(), 'texpile-universe-'));
	try {
		const archive = join(work, 'package.tar.gz');
		await writeFile(archive, new Uint8Array(await res.arrayBuffer()));
		const pkg = join(work, 'package');
		await mkdir(pkg);
		await untar(archive, pkg);
		const manifest = templateManifest(await readFile(join(pkg, 'typst.toml'), 'utf8'));
		if (!manifest) throw new Error(`${String(name)} is not a template`);
		const templateDir = inside(pkg, manifest.path);
		const entry = templateDir && inside(templateDir, manifest.entrypoint);
		if (!templateDir || !entry || !(await stat(entry).catch(() => null))?.isFile())
			throw new Error(`${String(name)} names a template entry file it does not ship`);
		await cp(templateDir, dir, { recursive: true, force: false, errorOnExist: false });
		return {
			entryPath: manifest.entrypoint
				.split('/')
				.filter((p) => p && p !== '.')
				.join('/')
		};
	} finally {
		await rm(work, { recursive: true, force: true }).catch(() => {});
	}
}
