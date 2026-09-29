// Real repositories for the live git tests: a bare repo in a temp dir stands in for GitHub, so it
// can be published to, moved ahead from a second clone, and made to conflict, with no network and
// no credentials. The tests skip themselves when git is not on PATH.
import { expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitAddRemote, gitPublish } from '../../../../../../electron/src/git/remote/gitRemote';

function hasGit(): boolean {
	try {
		execFileSync('git', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
export const AVAILABLE = hasGit();

export const run = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
export const out = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root }).toString().trim();

export function identify(root: string) {
	run(root, 'config', 'user.email', 'test@example.com');
	run(root, 'config', 'user.name', 'Ada Lovelace');
	run(root, 'config', 'commit.gpgsign', 'false');
}

export function commit(root: string, name: string, body: string, subject: string) {
	writeFileSync(join(root, name), body);
	run(root, 'add', '-A');
	run(root, 'commit', '-q', '-m', subject);
}

const dirs: string[] = [];
export function tempDir(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(d);
	return d;
}
/** for afterEach */
export function removeTempDirs() {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

/** a project with one version and no remote, and an empty bare repo beside it to publish to */
export function makeUnpublished(): { root: string; remote: string; dir: string } {
	const dir = tempDir('texpile-publish-');
	const remote = join(dir, 'remote.git');
	const root = join(dir, 'work');
	execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' });
	execFileSync('git', ['init', '-q', root], { stdio: 'ignore' });
	identify(root);
	commit(root, 'main.tex', 'First line.\nSecond line.\n', 'First draft');
	return { root, remote, dir };
}

/** a published project and a second clone of it: someone else, or the same author elsewhere */
export async function makePublished(): Promise<{ root: string; other: string; remote: string }> {
	const { root, remote, dir } = makeUnpublished();
	expect((await gitAddRemote(root, 'origin', remote)).ok).toBe(true);
	expect((await gitPublish(root, 'origin')).ok).toBe(true);
	const other = join(dir, 'other');
	execFileSync('git', ['clone', '-q', remote, other], { stdio: 'ignore' });
	identify(other);
	return { root, other, remote };
}
