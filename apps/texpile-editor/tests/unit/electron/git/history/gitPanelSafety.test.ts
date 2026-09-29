// The Source Control panel's safety net, against real repositories where git is involved:
// - a merge, rebase or cherry-pick left unfinished (by Sync or in a terminal) is reported, and the
//   files both sides changed are told apart from ordinary edits, instead of being ticked into the
//   next version with their conflict markers;
// - Restore brings a renamed file back under its old name instead of losing it;
// - what the author unticked survives the panel being closed;
// - status waits for a write in progress instead of racing it for the index lock;
// - a commit made in the terminal reaches the panel through the watcher.
//
// The live parts skip themselves when git is not on PATH.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitStatus } from '../../../../../../../electron/src/git/gitService';
import { gitRestore, gitRestoreInTheWay } from '../../../../../../../electron/src/git/history/gitHistory';
import { startWorkspaceWatch, stopWorkspaceWatch } from '../../../../../../../electron/src/fs/fsWatch';
import { scmDraftFor } from '$lib/workspace/scm/actions/scmDraft.svelte';
import { badgeOf, isConflicted } from '$lib/workspace/scm/gitStore';

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
function repo(): string {
	const root = mkdtempSync(join(tmpdir(), 'texpile-safety-'));
	dirs.push(root);
	run(root, 'init', '-q', '-b', 'main');
	run(root, 'config', 'user.email', 'test@example.com');
	run(root, 'config', 'user.name', 'Ada Lovelace');
	run(root, 'config', 'commit.gpgsign', 'false');
	return root;
}
function commit(root: string, name: string, body: string, subject: string) {
	writeFileSync(join(root, name), body);
	run(root, 'add', '-A');
	run(root, 'commit', '-q', '-m', subject);
}

describe('telling conflicts from edits', () => {
	it("reads every one of git's unmerged codes as a conflict, and nothing else", () => {
		for (const [x, y] of ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']) expect(isConflicted(x, y)).toBe(true);
		for (const [x, y] of [' M', 'M ', 'A ', ' D', '??', 'R ']) expect(isConflicted(x, y)).toBe(false);
		expect(badgeOf('U', 'U')).toBe('C');
		expect(badgeOf(' ', 'M')).toBe('M');
	});
});

describe.skipIf(!AVAILABLE)('an unfinished merge', () => {
	it('is reported, with the file both sides changed marked as such', async () => {
		const root = repo();
		commit(root, 'main.tex', 'First line.\n', 'First draft');
		run(root, 'checkout', '-q', '-b', 'theirs');
		commit(root, 'main.tex', 'Their first line.\n', 'Their edit');
		run(root, 'checkout', '-q', 'main');
		commit(root, 'main.tex', 'My first line.\n', 'My edit');
		try {
			run(root, 'merge', 'theirs');
		} catch {
			// the conflict is the point
		}

		const status = await gitStatus(root);
		expect(status.operation).toBe('merge');
		const entry = status.entries?.find((e) => e.path.endsWith('main.tex'));
		expect(entry && isConflicted(entry.x, entry.y)).toBe(true);

		run(root, 'merge', '--abort');
		expect((await gitStatus(root)).operation).toBeNull();
	});

	it('reports a rebase and a cherry-pick left half-done in the terminal', async () => {
		const root = repo();
		commit(root, 'main.tex', 'First line.\n', 'First draft');
		run(root, 'checkout', '-q', '-b', 'theirs');
		commit(root, 'main.tex', 'Their first line.\n', 'Their edit');
		const theirs = out(root, 'rev-parse', 'HEAD');
		run(root, 'checkout', '-q', 'main');
		commit(root, 'main.tex', 'My first line.\n', 'My edit');

		try {
			run(root, 'cherry-pick', theirs);
		} catch {
			// conflict
		}
		expect((await gitStatus(root)).operation).toBe('cherry-pick');
		run(root, 'cherry-pick', '--abort');

		try {
			run(root, 'rebase', 'theirs');
		} catch {
			// conflict
		}
		expect((await gitStatus(root)).operation).toBe('rebase');
		run(root, 'rebase', '--abort');
		expect((await gitStatus(root)).operation).toBeNull();
	});
});

describe.skipIf(!AVAILABLE)('restoring across a rename', () => {
	it('brings the file back under its old name', async () => {
		const root = repo();
		commit(root, 'intro.tex', 'The introduction.\n', 'First draft');
		const first = out(root, 'rev-parse', 'HEAD');
		renameSync(join(root, 'intro.tex'), join(root, 'introduction.tex'));
		run(root, 'add', '-A');
		run(root, 'commit', '-q', '-m', 'Rename the introduction');

		const res = await gitRestore(root, first, 'Restored "First draft"');
		expect(res.ok).toBe(true);
		expect(existsSync(join(root, 'intro.tex'))).toBe(true);
		expect(readFileSync(join(root, 'intro.tex'), 'utf8')).toBe('The introduction.\n');
		expect(existsSync(join(root, 'introduction.tex'))).toBe(false);
	});
});

describe.skipIf(!AVAILABLE)('restoring with uncommitted work', () => {
	function twoVersions() {
		const root = repo();
		commit(root, 'main.tex', 'First wording.\n', 'First draft');
		commit(root, 'private.tex', 'Private.\n', 'Notes');
		const first = out(root, 'rev-parse', 'HEAD');
		commit(root, 'main.tex', 'Second wording.\n', 'Second draft');
		return { root, first };
	}

	it('goes around work in a file it does not rewrite, and leaves that work uncommitted', async () => {
		const { root, first } = twoVersions();
		// unticked to stay on this computer
		writeFileSync(join(root, 'private.tex'), 'Kept here.\n');
		expect(await gitRestoreInTheWay(root, first)).toEqual({ ok: true, files: [] });

		expect((await gitRestore(root, first, 'Restored "Notes"')).ok).toBe(true);
		expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('First wording.\n');
		expect(readFileSync(join(root, 'private.tex'), 'utf8')).toBe('Kept here.\n');
		expect(out(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('main.tex');
	});

	it('names work in a file it would rewrite, and refuses until it is saved', async () => {
		const { root, first } = twoVersions();
		writeFileSync(join(root, 'main.tex'), 'Typed over the second wording.\n');
		expect(await gitRestoreInTheWay(root, first)).toEqual({ ok: true, files: [join(root, 'main.tex')] });

		expect((await gitRestore(root, first, 'Restored "Notes"')).ok).toBe(false);
		expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('Typed over the second wording.\n');
	});
});

describe('what the author chose in the panel', () => {
	it('outlives the panel, per folder, until a version is saved', () => {
		const draft = scmDraftFor('/projects/thesis');
		draft.excluded = ['/projects/thesis/notes.tex'];
		draft.message = 'Tighten the proof';

		// the panel is destroyed and made again when the sidebar switches views
		const again = scmDraftFor('/projects/thesis');
		expect(again.excluded).toEqual(['/projects/thesis/notes.tex']);
		expect(again.message).toBe('Tighten the proof');
		expect(scmDraftFor('/projects/paper').excluded).toEqual([]);

		again.clear();
		expect(scmDraftFor('/projects/thesis').message).toBe('');
	});
});

describe('status during a write', () => {
	it('waits until the write is over, then runs once', async () => {
		vi.resetModules();
		const gitStatusMock = vi.fn(async () => ({ ok: true, entries: [], branch: 'main', head: 'abc' }));
		vi.doMock('$lib/workspace/scm/git', () => ({ gitStatus: gitStatusMock, gitLog: vi.fn(async () => ({ ok: true, entries: [] })) }));
		const store = await import('$lib/workspace/scm/gitStore');

		store.setGitWriting(true);
		await store.refreshGitStatus('/projects/thesis');
		await store.refreshGitStatus('/projects/thesis');
		expect(gitStatusMock).not.toHaveBeenCalled();

		store.setGitWriting(false);
		await vi.waitFor(() => expect(gitStatusMock).toHaveBeenCalledTimes(1));
		vi.doUnmock('$lib/workspace/scm/git');
	});
});

describe.skipIf(!AVAILABLE)('a commit made in the terminal', () => {
	it('reaches the panel through the watcher, although .git is hidden from the file tree', async () => {
		const root = repo();
		commit(root, 'main.tex', 'First.\n', 'First draft');
		// the file the commit below saves is already written: only git's own files change now
		writeFileSync(join(root, 'main.tex'), 'Second.\n');
		const changed = vi.fn();
		startWorkspaceWatch('safety', root, changed);
		try {
			await new Promise((r) => setTimeout(r, 1500)); // chokidar settling, and the edit above
			changed.mockClear();
			run(root, 'commit', '-q', '-am', 'Second draft');
			await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 5000 });
		} finally {
			stopWorkspaceWatch('safety');
		}
	});
});
