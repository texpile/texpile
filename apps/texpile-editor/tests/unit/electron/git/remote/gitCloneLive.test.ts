// Cloning into a new folder, against a real bare repository (gitLiveFixture.ts): what arrives, what
// is refused before anything downloads, and what a stopped clone leaves behind (nothing).
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitClone, classifyCloneError, isFolderName, type CloneProgress } from '../../../../../../../electron/src/git/remote/gitClone';
import { copyMissing } from '../../../../../../../electron/src/templates/templateCopy';
import { AVAILABLE, out, run, identify, commit, tempDir, removeTempDirs, makePublished } from '../gitLiveFixture';

afterEach(removeTempDirs);

describe.skipIf(!AVAILABLE)('cloning a repository', () => {
	it('makes the folder, with the files, the history and the address to sync with', async () => {
		const { remote, root } = await makePublished();
		const parent = tempDir('texpile-clone-');
		const steps: CloneProgress[] = [];
		const res = await gitClone(remote, parent, 'thesis', {}, (p) => steps.push(p));
		expect(res).toEqual({ ok: true, path: join(parent, 'thesis') });
		expect(readFileSync(join(parent, 'thesis', 'main.tex'), 'utf8')).toBe('First line.\nSecond line.\n');
		expect(out(join(parent, 'thesis'), 'rev-parse', 'HEAD')).toBe(out(root, 'rev-parse', 'HEAD'));
		expect(out(join(parent, 'thesis'), 'rev-parse', '--abbrev-ref', '@{u}')).toMatch(/^origin\//);
		// progress is whatever git reported; a local clone may report none, but never nonsense
		for (const s of steps) expect(s.percent).toBeGreaterThanOrEqual(0);
	});

	it('clones a template as its newest files alone: no history, and no .git in the project it joins', async () => {
		const { remote, root } = await makePublished();
		const staging = tempDir('texpile-staging-');
		// file:// because git ignores --depth for a plain path
		const res = await gitClone(`file://${remote}`, staging, 'clone', {}, undefined, undefined, { shallow: true });
		expect(res.ok).toBe(true);
		expect(out(join(staging, 'clone'), 'rev-list', '--count', 'HEAD')).toBe('1');
		const project = tempDir('texpile-project-');
		execFileSync('git', ['init', '-q', project], { stdio: 'ignore', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
		const head = readFileSync(join(project, '.git', 'HEAD'), 'utf8');
		await copyMissing(join(staging, 'clone'), project);
		expect(readFileSync(join(project, 'main.tex'), 'utf8')).toBe(readFileSync(join(root, 'main.tex'), 'utf8'));
		expect(readFileSync(join(project, '.git', 'HEAD'), 'utf8')).toBe(head);
		expect(existsSync(join(project, '.git', 'packed-refs'))).toBe(false);
	});

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

	it('opens a project whose submodule could not be fetched, and says so, rather than calling it missing', async () => {
		const { root, remote } = await makePublished();
		// a style the project takes from another repository, which has since gone (or is private)
		const style = join(tempDir('texpile-style-'), 'style');
		execFileSync('git', ['init', '-q', style], { stdio: 'ignore' });
		identify(style);
		commit(style, 'thesis.cls', '% class\n', 'Class');
		run(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', style, 'style');
		run(root, 'commit', '-q', '-m', 'Use the style');
		run(root, 'push', '-q');
		rmSync(style, { recursive: true, force: true });

		const parent = tempDir('texpile-clone-');
		const res = await gitClone(remote, parent, 'thesis');
		expect(res).toMatchObject({ ok: true, path: join(parent, 'thesis') });
		expect(res.submodules).toBeTruthy();
		expect(readFileSync(join(parent, 'thesis', 'main.tex'), 'utf8')).toBe('First line.\nSecond line.\n');
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
