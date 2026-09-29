// Save version rebuilds the index from the tick boxes: unstage everything, stage what is ticked,
// commit. The unstage fell back to `git rm --cached -r .` on ANY failure, and a reset that loses
// the race for .git/index.lock against a status refresh is a failure. With history, that fallback
// emptied the index, and the version then recorded every unticked file as deleted.
//
// Skips itself when git is not on PATH, like the other live git fixtures.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { gitUnstage, gitInit } from '../../../../../../../electron/src/git/gitService';

function hasGit(): boolean {
	try {
		execFileSync('git', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
const AVAILABLE = hasGit();

const run = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
const out = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root }).toString().trim();

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tempDir(): string {
	const d = mkdtempSync(join(tmpdir(), 'texpile-index-'));
	dirs.push(d);
	return d;
}

describe.skipIf(!AVAILABLE)('rebuilding the index for a version', () => {
	// The race itself is timing: the lock is held while reset runs and gone by the time the fallback
	// does. A git on PATH that fails `reset` exactly as a lost race does, and passes everything else
	// to the real one, makes that moment happen every time.
	it.skipIf(process.platform === 'win32')('leaves the index alone when the reset fails in a repository with history', async () => {
		const root = tempDir();
		run(root, 'init', '-q');
		run(root, 'config', 'user.email', 'test@example.com');
		run(root, 'config', 'user.name', 'Ada Lovelace');
		// not with the developer's own signing key
		run(root, 'config', 'commit.gpgsign', 'false');
		writeFileSync(join(root, 'main.tex'), 'a\n');
		writeFileSync(join(root, 'refs.bib'), 'b\n');
		run(root, 'add', '-A');
		run(root, 'commit', '-q', '-m', 'First draft');

		const realGit = execFileSync('sh', ['-c', 'command -v git']).toString().trim();
		const shim = join(tempDir(), 'git');
		writeFileSync(
			shim,
			`#!/bin/sh\ncase " $* " in *" reset "*) echo "fatal: Unable to create '.git/index.lock': File exists." >&2; exit 128;; esac\nexec "${realGit}" "$@"\n`
		);
		chmodSync(shim, 0o755);
		const path = process.env.PATH;
		process.env.PATH = `${dirname(shim)}${delimiter}${path}`;
		let res;
		try {
			res = await gitUnstage(root, []);
		} finally {
			process.env.PATH = path;
		}

		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/index\.lock/);
		expect(out(root, 'ls-files').split('\n')).toEqual(['main.tex', 'refs.bib']);
	});

	it('still unstages before the first version, where there is no HEAD to reset to', async () => {
		const root = tempDir();
		run(root, 'init', '-q');
		writeFileSync(join(root, 'main.tex'), 'a\n');
		run(root, 'add', '-A');

		expect((await gitUnstage(root, [])).ok).toBe(true);
		expect(out(root, 'ls-files')).toBe('');
	});
});

describe.skipIf(!AVAILABLE)('starting a repository', () => {
	const saved = { global: process.env.GIT_CONFIG_GLOBAL, nosystem: process.env.GIT_CONFIG_NOSYSTEM };
	afterEach(() => {
		for (const [k, v] of [
			['GIT_CONFIG_GLOBAL', saved.global],
			['GIT_CONFIG_NOSYSTEM', saved.nosystem]
		] as const) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	});

	it('names the first branch main, as GitHub does, when the author has not chosen a default', async () => {
		const root = tempDir();
		process.env.GIT_CONFIG_GLOBAL = join(root, 'empty.gitconfig');
		process.env.GIT_CONFIG_NOSYSTEM = '1';
		writeFileSync(process.env.GIT_CONFIG_GLOBAL, '');
		const project = join(root, 'thesis');
		execFileSync('mkdir', [project]);

		expect((await gitInit(project)).ok).toBe(true);
		expect(out(project, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
	});

	it("keeps the author's own default branch name", async () => {
		const root = tempDir();
		process.env.GIT_CONFIG_GLOBAL = join(root, 'chosen.gitconfig');
		process.env.GIT_CONFIG_NOSYSTEM = '1';
		writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[init]\n\tdefaultBranch = trunk\n');
		const project = join(root, 'thesis');
		execFileSync('mkdir', [project]);

		expect((await gitInit(project)).ok).toBe(true);
		expect(out(project, 'symbolic-ref', '--short', 'HEAD')).toBe('trunk');
	});
});
