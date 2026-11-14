// Emit versions.json, the download page's version history: every release whose installers the download host still
// serves, newest first. Run in CI after a release is uploaded, and by hand from the versions workflow.
//   node apps/texpile-editor/scripts/versions-json.mjs dist/versions.was.json [dist/latest.json] > dist/versions.json
// The first file is the manifest as it stands (its dates and notes are kept), the second the release just uploaded.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readChangelog } from './changelog.mjs';

const HOST = 'https://dl.texpile.com';

/** the names a release's installers have gone by, per download key
 * @param {string} version */
export function installerNames(version) {
	return {
		windows: [`Texpile-Setup-${version}.exe`],
		windowsPortable: [`Texpile-${version}-portable.zip`],
		mac: [`Texpile-${version}.dmg`],
		// 2.0.0 dropped the version from the AppImage's name
		linuxAppImage: ['Texpile.AppImage', `Texpile-${version}.AppImage`],
		linuxDeb: [`texpile-${version}.deb`]
	};
}

/** @param {string} version */
function parts(version) {
	const [core, pre] = version.split(/-(.*)/s);
	return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : null };
}

/** newest first, a release ahead of its own prereleases
 * @param {string} a
 * @param {string} b */
export function newestFirst(a, b) {
	const [x, y] = [parts(a), parts(b)];
	for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return y.core[i] - x.core[i];
	if (!x.pre || !y.pre) return x.pre ? 1 : y.pre ? -1 : 0;
	for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
		const [p, q] = [x.pre[i], y.pre[i]];
		if (p === q) continue;
		if (p === undefined || q === undefined) return p === undefined ? 1 : -1;
		const [n, m] = [Number(p), Number(q)];
		if (!Number.isNaN(n) && !Number.isNaN(m)) return m - n;
		return p < q ? 1 : -1;
	}
	return 0;
}

/**
 * `served` holds the paths the host answered for. `known` are entries already written (their dates and notes win),
 * `changelog` the parsed CHANGELOG.md for the rest.
 * @param {{ versions: string[], served: Set<string>, known: { version: string, publishedAt?: string, notes?: string[] }[], changelog: { version: string, date?: string, notes: string[] }[] }} from
 */
export function buildManifest({ versions, served, known, changelog }) {
	const entries = [];
	for (const version of [...new Set(versions)].sort(newestFirst)) {
		/** @type {Record<string, string>} */
		const files = {};
		for (const [key, names] of Object.entries(installerNames(version))) {
			const path = names.map((name) => `v${version}/${name}`).find((at) => served.has(at));
			if (path) files[key] = path;
		}
		if (!Object.keys(files).length) continue;
		const was = known.find((e) => e.version === version);
		const logged = changelog.find((e) => e.version === version);
		const publishedAt = was?.publishedAt ?? (logged?.date ? new Date(logged.date).toISOString() : undefined);
		const notes = was?.notes ?? (logged?.notes.length ? logged.notes : undefined);
		entries.push({ version, ...(publishedAt ? { publishedAt } : {}), files, ...(notes ? { notes } : {}) });
	}
	return { versions: entries };
}

/** @param {string} path */
async function isServed(path) {
	const res = await fetch(`${HOST}/${path}`, { method: 'HEAD' });
	if (res.status === 200) return true;
	if (res.status === 404) return false;
	// anything else says nothing about the file, and a list written from it would drop releases
	throw new Error(`${HOST}/${path} answered ${res.status}`);
}

async function main() {
	const [wasFile, latestFile] = process.argv.slice(2);
	/** @param {string} file */
	const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
	const known = [...(latestFile ? [read(latestFile)] : []), ...(read(wasFile).versions ?? [])];
	const changelog = readChangelog().filter((e) => e.released);
	const tags = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin', 'v*'], { encoding: 'utf8' })
		.split('\n')
		.map((line) => line.split('refs/tags/v')[1])
		.filter(Boolean);
	const versions = [...known.map((e) => e.version), ...changelog.map((e) => e.version), ...tags];
	const paths = [...new Set(versions)].flatMap((version) =>
		Object.values(installerNames(version)).flatMap((names) => names.map((name) => `v${version}/${name}`))
	);
	const served = new Set();
	for (let i = 0; i < paths.length; i += 8) {
		const batch = paths.slice(i, i + 8);
		const found = await Promise.all(batch.map(isServed));
		batch.forEach((path, n) => found[n] && served.add(path));
	}
	console.log(JSON.stringify(buildManifest({ versions, served, known, changelog }), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
