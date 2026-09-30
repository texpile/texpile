// The one-click tinymist install, end to end against a small local archive: no network, a fake
// tinymist that answers --version the way a release build does, and the system's own tar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	installTinymist,
	removeTinymist,
	type TinymistInstallDeps,
	type TinymistInstallStep
} from '../../../../../electron/src/tinymist/tinymistInstall';
import { TinymistInstallError } from '../../../../../electron/src/tinymist/tinymistInstallError';
import type { TinymistAsset } from '../../../../../electron/src/tinymist/tinymistRelease';
import { managedTinymistPath, probeTinymist } from '../../../../../electron/src/typstService';

// the probe would otherwise start a login shell to recover PATH
process.env.TEXPILE_DISABLE_SHELL_ENV = '1';

const NAME = 'tinymist-x86_64-unknown-linux-gnu.tar.gz';
// what a release build prints: no version of its own in the long form, so the probe asks -V too
const FAKE_TINYMIST = [
	'#!/bin/sh',
	'if [ "$1" = "-V" ]; then echo "tinymist 0.15.8"; exit 0; fi',
	'printf "tinymist \\nBuild Git Describe:  VERGEN_IDEMPOTENT_OUTPUT\\nTypst Version:       0.15.1\\n"'
].join('\n');

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-tinymist-')));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** a .tar.gz laid out like the release's: one folder holding the program */
function archive(label: string, files: Record<string, string>): { bytes: Buffer; sha256: string } {
	const root = path.join(tmp, 'src', label);
	for (const [rel, text] of Object.entries(files)) {
		const file = path.join(root, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, text, { mode: 0o644 });
	}
	const out = path.join(tmp, `${label}.tar.gz`);
	execFileSync('tar', ['-czf', out, '-C', root, '.']);
	const bytes = fs.readFileSync(out);
	return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

let good: { bytes: Buffer; sha256: string };
beforeAll(() => {
	good = archive('good', { 'tinymist-x86_64-unknown-linux-gnu/tinymist': FAKE_TINYMIST });
});

function asset(sha256: string): TinymistAsset {
	return { name: NAME, url: `https://example.invalid/${NAME}`, sha256, format: 'tar.gz' };
}

function respond(bytes: Buffer, init: ResponseInit = {}) {
	return async () => new Response(new Uint8Array(bytes), { headers: { 'content-length': String(bytes.length) }, ...init });
}

let n = 0;
function setup(overrides: Partial<TinymistInstallDeps> = {}) {
	const userData = path.join(tmp, `userData-${++n}`);
	const steps: TinymistInstallStep[] = [];
	let swaps = 0;
	const deps: TinymistInstallDeps = {
		userData,
		asset: asset(good.sha256),
		fetchArchive: respond(good.bytes),
		signal: new AbortController().signal,
		onStep: (s) => steps.push(s),
		probe: probeTinymist,
		swap: (change) => {
			swaps++;
			return change();
		},
		platform: 'linux',
		...overrides
	};
	return { deps, userData, steps, swaps: () => swaps, target: managedTinymistPath(userData) };
}

function leftovers(userData: string): string[] {
	return fs.existsSync(userData) ? fs.readdirSync(userData).filter((e) => e !== 'tinymist') : [];
}

describe.skipIf(process.platform === 'win32')('installTinymist', () => {
	it('downloads, checks, unpacks and puts the program where resolveTinymist looks', async () => {
		const t = setup();
		const result = await installTinymist(t.deps);
		expect(result).toEqual({ ok: true, command: t.target, version: '0.15.8', typstVersion: '0.15.1' });
		expect(fs.statSync(t.target).mode & 0o111).not.toBe(0);
		expect(fs.readFileSync(t.target, 'utf8')).toBe(FAKE_TINYMIST);
		expect(t.swaps()).toBe(1);
		expect(t.steps.map((s) => s.phase)).toEqual(expect.arrayContaining(['download', 'verify', 'extract']));
		const lastDownload = t.steps.filter((s) => s.phase === 'download').pop();
		expect(lastDownload).toEqual({ phase: 'download', received: good.bytes.length, total: good.bytes.length });
		expect(leftovers(t.userData)).toEqual([]);
	});

	it('refuses an archive that does not match the pinned checksum, and installs nothing', async () => {
		const t = setup({ asset: asset('0'.repeat(64)) });
		const result = await installTinymist(t.deps);
		expect(result).toMatchObject({ ok: false, reason: 'checksum' });
		expect(fs.existsSync(t.target)).toBe(false);
		expect(t.swaps()).toBe(0);
		expect(leftovers(t.userData)).toEqual([]);
	});

	it('keeps the copy already there when the new one is refused', async () => {
		const t = setup({ fetchArchive: respond(Buffer.from('not the archive')) });
		fs.mkdirSync(path.dirname(t.target), { recursive: true });
		fs.writeFileSync(t.target, 'previous');
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'checksum' });
		expect(fs.readFileSync(t.target, 'utf8')).toBe('previous');
	});

	it('replaces the copy already there on a reinstall', async () => {
		const t = setup();
		fs.mkdirSync(path.dirname(t.target), { recursive: true });
		fs.writeFileSync(t.target, 'previous');
		expect(await installTinymist(t.deps)).toMatchObject({ ok: true });
		expect(fs.readFileSync(t.target, 'utf8')).toBe(FAKE_TINYMIST);
		expect(leftovers(t.userData)).toEqual([]);
	});

	it('puts the copy already there back when the new one cannot be moved in', async () => {
		const t = setup({
			swap: (change) => {
				// the new program vanishes between the two renames, as when a scanner holds it
				const staging = fs.readdirSync(t.userData).find((e) => e.startsWith('.tinymist-staging-'))!;
				fs.rmSync(path.join(t.userData, staging, 'unpacked'), { recursive: true });
				return change();
			}
		});
		fs.mkdirSync(path.dirname(t.target), { recursive: true });
		fs.writeFileSync(t.target, 'previous');
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'disk' });
		expect(fs.readFileSync(t.target, 'utf8')).toBe('previous');
		expect(leftovers(t.userData)).toEqual([]);
	});

	it('says offline when dl.texpile.com cannot be reached', async () => {
		const t = setup({
			fetchArchive: async () => {
				throw new TypeError('fetch failed');
			}
		});
		expect(await installTinymist(t.deps)).toEqual({ ok: false, reason: 'offline', detail: 'fetch failed' });
		expect(leftovers(t.userData)).toEqual([]);
	});

	it('names a certificate the connection was refused over, rather than calling it offline', async () => {
		const t = setup({
			fetchArchive: async () => {
				throw new Error('net::ERR_CERT_AUTHORITY_INVALID');
			}
		});
		expect(await installTinymist(t.deps)).toEqual({ ok: false, reason: 'download', detail: 'net::ERR_CERT_AUTHORITY_INVALID' });
	});

	it('says the download failed when dl.texpile.com answers with an error', async () => {
		const t = setup({ fetchArchive: async () => new Response('Not Found', { status: 404 }) });
		expect(await installTinymist(t.deps)).toEqual({ ok: false, reason: 'download', detail: 'HTTP 404' });
	});

	it('says the download failed when it ends short', async () => {
		const t = setup({
			fetchArchive: async () =>
				new Response(new Uint8Array(good.bytes.subarray(0, 10)), { headers: { 'content-length': String(good.bytes.length) } })
		});
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'download' });
		expect(fs.existsSync(t.target)).toBe(false);
	});

	it('stops on Cancel and cleans up after itself', async () => {
		const cancel = new AbortController();
		const t = setup({
			signal: cancel.signal,
			fetchArchive: async (_url, init) => {
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new Uint8Array(good.bytes.subarray(0, 64)));
						// then nothing more until the reader gives up
						init.signal.addEventListener('abort', () => controller.error(init.signal.reason));
					}
				});
				return new Response(body, { headers: { 'content-length': String(good.bytes.length) } });
			},
			onStep: (s) => {
				if (s.received > 0) cancel.abort();
			}
		});
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'cancelled' });
		expect(fs.existsSync(t.target)).toBe(false);
		expect(leftovers(t.userData)).toEqual([]);
	});

	it('stops on a Cancel that comes after the download, keeping the copy already there', async () => {
		const cancel = new AbortController();
		const t = setup({
			signal: cancel.signal,
			onStep: (s) => {
				if (s.phase === 'extract') cancel.abort();
			}
		});
		fs.mkdirSync(path.dirname(t.target), { recursive: true });
		fs.writeFileSync(t.target, 'previous');
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'cancelled' });
		expect(t.swaps()).toBe(0);
		expect(fs.readFileSync(t.target, 'utf8')).toBe('previous');
	});

	it('refuses a program that does not run here', async () => {
		const broken = archive('broken', { 'tinymist-x86_64-unknown-linux-gnu/tinymist': '#!/bin/sh\nexit 1\n' });
		const t = setup({ asset: asset(broken.sha256), fetchArchive: respond(broken.bytes) });
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'broken' });
		expect(fs.existsSync(t.target)).toBe(false);
	});

	it('refuses an archive with no tinymist in it', async () => {
		const empty = archive('empty', { 'tinymist-x86_64-unknown-linux-gnu/README.md': 'nothing here' });
		const t = setup({ asset: asset(empty.sha256), fetchArchive: respond(empty.bytes) });
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'extract' });
	});

	it('finds the program at the top of the archive too (the zip layout)', async () => {
		const flat = archive('flat', { tinymist: FAKE_TINYMIST });
		const t = setup({ asset: asset(flat.sha256), fetchArchive: respond(flat.bytes) });
		expect(await installTinymist(t.deps)).toMatchObject({ ok: true, command: t.target });
	});

	it('says so when there is no build for this machine', async () => {
		const t = setup({ asset: null });
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'unsupported' });
	});

	it('blames the disk when the data folder cannot be written', async () => {
		const t = setup();
		fs.writeFileSync(t.userData, 'a file where the folder should be');
		expect(await installTinymist(t.deps)).toMatchObject({ ok: false, reason: 'disk' });
	});

	it('sweeps work folders an earlier install left behind', async () => {
		const t = setup();
		fs.mkdirSync(path.join(t.userData, '.tinymist-staging-crashed'), { recursive: true });
		expect(await installTinymist(t.deps)).toMatchObject({ ok: true });
		expect(leftovers(t.userData)).toEqual([]);
	});
});

describe.skipIf(process.platform === 'win32')('removeTinymist', () => {
	it("deletes Texpile's copy and its folder", async () => {
		const t = setup();
		await installTinymist(t.deps);
		let swaps = 0;
		const result = await removeTinymist(t.userData, (change) => {
			swaps++;
			return change();
		});
		expect(result).toEqual({ ok: true });
		expect(swaps).toBe(1);
		expect(fs.existsSync(path.dirname(t.target))).toBe(false);
		expect(fs.readdirSync(t.userData)).toEqual([]);
	});

	it('has nothing to do when nothing is installed', async () => {
		const t = setup();
		expect(await removeTinymist(t.userData, (change) => change())).toEqual({ ok: true });
	});
});

describe('TinymistInstallError.from', () => {
	it('reads a full or locked disk out of the error code', () => {
		for (const code of ['ENOSPC', 'EACCES', 'EPERM', 'EROFS']) {
			expect(TinymistInstallError.from(Object.assign(new Error(code), { code }), 'download').reason).toBe('disk');
		}
		expect(TinymistInstallError.from(new Error('socket hang up'), 'download').reason).toBe('download');
	});
});
