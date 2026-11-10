import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { installTexLive } from '../../../../../../electron/src/texlive/texliveInstall';
import type { TexLiveAsset } from '../../../../../../electron/src/texlive/texliveRelease';

const dirs: string[] = [];

afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// a tree laid out as the bundle is: texlive/ at the top of the archive
function archive(): { bytes: Buffer; sha256: string } {
	const src = fs.mkdtempSync(path.join(os.tmpdir(), 'texlive-src-'));
	dirs.push(src);
	const bin = path.join(src, 'texlive', 'bin', 'x86_64-linux');
	fs.mkdirSync(bin, { recursive: true });
	fs.writeFileSync(path.join(bin, 'lualatex'), '#!/bin/sh\n', { mode: 0o755 });
	execFileSync('tar', ['-cJf', path.join(src, 'texlive.tar.xz'), '-C', src, 'texlive']);
	const bytes = fs.readFileSync(path.join(src, 'texlive.tar.xz'));
	return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function install(sha256: string, bytes: Buffer) {
	const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'texlive-root-'));
	dirs.push(parent);
	const root = path.join(parent, 'texlive');
	const asset: TexLiveAsset = {
		name: 'texlive-x86_64-linux.tar.xz',
		url: 'https://dl.example/t',
		sha256,
		format: 'tar.xz',
		platform: 'x86_64-linux',
		megabytes: 1
	};
	const done = installTexLive({
		root,
		asset,
		fetchArchive: async () => new Response(new Uint8Array(bytes)),
		signal: new AbortController().signal,
		onStep: () => undefined,
		probe: async () => 'This is LuaHBTeX, Version 1.24.0 (TeX Live 2026)',
		swap: (change) => change(),
		platform: 'linux'
	});
	return { parent, root, done };
}

// Windows' tar reads xz only on some builds; the bundle for Windows is a zip
describe.skipIf(process.platform === 'win32')('installTexLive', () => {
	it('puts the tree in place and leaves no work folder', async () => {
		const { bytes, sha256 } = archive();
		const { parent, root, done } = install(sha256, bytes);
		expect(await done).toEqual({ ok: true, bin: path.join(root, 'bin', 'x86_64-linux'), detail: expect.stringContaining('TeX Live 2026') });
		expect(fs.existsSync(path.join(root, 'bin', 'x86_64-linux', 'lualatex'))).toBe(true);
		expect(fs.readdirSync(parent)).toEqual(['texlive']);
	});

	it('installs nothing from a download that does not match the pin', async () => {
		const { bytes } = archive();
		const { parent, done } = install('0'.repeat(64), bytes);
		expect(await done).toMatchObject({ ok: false, reason: 'checksum' });
		expect(fs.readdirSync(parent)).toEqual([]);
	});
});
