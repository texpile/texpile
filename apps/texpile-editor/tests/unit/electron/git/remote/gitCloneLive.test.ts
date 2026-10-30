// Cloning into a new folder, against a real bare repository (gitLiveFixture.ts): what arrives, what
// is refused before anything downloads, and what a stopped clone leaves behind (nothing).
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitClone, classifyCloneError, isFolderName } from '../../../../../../../electron/src/git/remote/gitClone';
import { AVAILABLE, tempDir, removeTempDirs, makePublished } from '../gitLiveFixture';

afterEach(removeTempDirs);

describe.skipIf(!AVAILABLE)('cloning a repository', () => {
	it('refuses a folder that already has something in it, before downloading anything', async () => {
		const { remote } = await makePublished();
		const parent = tempDir('texpile-clone-');
		mkdirSync(join(parent, 'thesis'));
		writeFileSync(join(parent, 'thesis', 'notes.txt'), 'mine');
		expect(await gitClone(remote, parent, 'thesis')).toEqual({ ok: false, failure: 'exists', path: join(parent, 'thesis') });
		expect(readFileSync(join(parent, 'thesis', 'notes.txt'), 'utf8')).toBe('mine');
		// an empty folder is fine: it is what someone makes first and then clones into
		mkdirSync(join(parent, 'empty'));
		expect((await gitClone(remote, parent, 'empty')).ok).toBe(true);
	});

	it('names a missing repository as missing, and leaves no folder behind', async () => {
		const parent = tempDir('texpile-clone-');
		const res = await gitClone(join(parent, 'nothing-here.git'), parent, 'copy');
		expect(res).toMatchObject({ ok: false, failure: 'not-found' });
		expect(existsSync(join(parent, 'copy'))).toBe(false);
	});

	it('stops when asked, and leaves no folder behind', async () => {
		const { remote } = await makePublished();
		const parent = tempDir('texpile-clone-');
		const stop = new AbortController();
		stop.abort();
		expect(await gitClone(remote, parent, 'thesis', {}, undefined, stop.signal)).toMatchObject({ ok: false, failure: 'cancelled' });
		expect(existsSync(join(parent, 'thesis'))).toBe(false);
	});

	it('refuses an address git would read as an option, a path for a name, or a relative place', async () => {
		const parent = tempDir('texpile-clone-');
		expect(await gitClone('--upload-pack=touch x', parent, 'a')).toEqual({ ok: false, failure: 'invalid' });
		expect(await gitClone('ext::sh -c touch% x', parent, 'a')).toEqual({ ok: false, failure: 'invalid' });
		expect(await gitClone('https://example.org/a.git', parent, '../escape')).toEqual({ ok: false, failure: 'invalid' });
		expect(await gitClone('https://example.org/a.git', 'relative/place', 'a')).toEqual({ ok: false, failure: 'invalid' });
	});
});

describe('reading why a clone failed', () => {
	it('tells a missing repository from a refused sign-in and a dead connection', () => {
		expect(classifyCloneError("remote: Repository not found.\nfatal: repository 'https://github.com/a/b.git/' not found")).toBe(
			'not-found'
		);
		expect(classifyCloneError("fatal: Authentication failed for 'https://github.com/a/b.git/'")).toBe('auth');
		expect(classifyCloneError('fatal: unable to access ...: Could not resolve host: github.com')).toBe('network');
		expect(classifyCloneError('fatal: something else entirely')).toBe('other');
	});

	it('takes a folder name, never a path', () => {
		expect(isFolderName('My Thesis')).toBe(true);
		for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'c:', ' lead']) expect(isFolderName(bad)).toBe(false);
	});
});
