// The history surface against a real repo: the parsers being right was never the problem. A NUL
// written literally into the --format argument made Node refuse to spawn git at all, and no parser
// test could see it - the parser was fed a stream git had never been asked to produce.
//
// Skips itself when git is not on PATH, like the tinymist fixtures do.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gitLog, gitChangesSince } from '../../../../../../../electron/src/git/history/gitHistory';

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

/** a repo with two versions: one at the root, one touching only chapters/ */
function makeRepo(): string {
	const root = mkdtempSync(join(tmpdir(), 'texpile-gitlog-'));
	run(root, 'init', '-q');
	run(root, 'config', 'user.email', 'test@example.com');
	run(root, 'config', 'user.name', 'Ada Lovelace');
	run(root, 'config', 'commit.gpgsign', 'false');

	writeFileSync(join(root, 'main.tex'), '\\documentclass{article}\n');
	writeFileSync(join(root, 'refs.bib'), '@book{a,title={A}}\n');
	run(root, 'add', '-A');
	run(root, 'commit', '-q', '-m', 'First draft');

	mkdirSync(join(root, 'chapters'));
	writeFileSync(join(root, 'chapters', 'methods.tex'), 'Methods.\n');
	run(root, 'add', '-A');
	// a subject with a newline in it: the case the delimiters exist for
	run(root, 'commit', '-q', '-m', 'Rewrote the methods\n\nWith detail in the body.');
	return root;
}

describe.skipIf(!AVAILABLE)('gitLog against a real repo', () => {
	it('reads the versions back, newest first', async () => {
		const root = makeRepo();
		try {
			const res = await gitLog(root);
			expect(res.ok).toBe(true);
			expect(res.entries?.map((e) => e.subject)).toEqual(['Rewrote the methods', 'First draft']);

			const [newest] = res.entries ?? [];
			expect(newest.hash).toMatch(/^[0-9a-f]{40}$/);
			expect(newest.short.length).toBeGreaterThan(0);
			expect(newest.author).toBe('Ada Lovelace');
			// %aI, so Date can read it - the timeline formats "3 days ago" from this
			expect(Number.isFinite(new Date(newest.date).getTime())).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// the pathspec half: a project opened inside a bigger repo lists its own history, and the
	// pathspec has to be repo-relative and forward-slashed or it matches nothing and hides everything
	it('scopes to the opened folder when it is a subdirectory', async () => {
		const root = makeRepo();
		try {
			const res = await gitLog(join(root, 'chapters'));
			expect(res.ok).toBe(true);
			expect(res.entries?.map((e) => e.subject)).toEqual(['Rewrote the methods']);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// a truncated list that does not say so reads as the project's first version
	it('says when the history runs past what was asked for', async () => {
		const root = makeRepo();
		try {
			for (let i = 0; i < 4; i++) {
				writeFileSync(join(root, 'main.tex'), `\\documentclass{article} % ${i}\n`);
				run(root, 'commit', '-q', '-am', `Revision ${i}`);
			}

			const short = await gitLog(root, 3);
			expect(short.entries).toHaveLength(3);
			expect(short.hasMore).toBe(true);

			// asking for more reaches further back, and eventually stops claiming there is more
			const all = await gitLog(root, 100);
			expect(all.entries!.length).toBeGreaterThan(3);
			expect(all.hasMore).toBe(false);
			// the newest is the same either way: the extra page is older versions, not a different list
			expect(short.entries![0].hash).toBe(all.entries![0].hash);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('does not claim there is more when the history ends exactly on the limit', async () => {
		const root = makeRepo(); // exactly two versions
		try {
			const res = await gitLog(root, 2);
			expect(res.entries).toHaveLength(2);
			expect(res.hasMore).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('calls an unborn HEAD an empty history rather than a failure', async () => {
		const root = mkdtempSync(join(tmpdir(), 'texpile-gitlog-empty-'));
		try {
			run(root, 'init', '-q');
			const res = await gitLog(root);
			expect(res.ok).toBe(true);
			expect(res.entries).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe.skipIf(!AVAILABLE)('gitChangesSince against a real repo', () => {
	/** the case the whole design turns on: a file the older version never touched, edited since */
	it('lists what differs from a version, not what that version changed', async () => {
		const root = makeRepo();
		try {
			const log = await gitLog(root);
			const first = log.entries?.[1];
			expect(first?.subject).toBe('First draft');

			// uncommitted edit to a file the second version did not touch either
			writeFileSync(join(root, 'main.tex'), '\\documentclass{report}\n');

			const res = await gitChangesSince(root, first!.hash);
			expect(res.ok).toBe(true);
			const byPath = Object.fromEntries((res.entries ?? []).map((f) => [f.path, f.status]));
			// added since that version...
			expect(byPath[join(root, 'chapters', 'methods.tex')]).toBe('A');
			// ...and modified since, though NO version between then and now touched it: the commit's
			// own file list would have missed this entirely
			expect(byPath[join(root, 'main.tex')]).toBe('M');
			// untouched since, so absent - listing it would open an empty diff
			expect(byPath[join(root, 'refs.bib')]).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('reports nothing when the working copy matches the version', async () => {
		const root = makeRepo();
		try {
			const log = await gitLog(root);
			const res = await gitChangesSince(root, log.entries![0].hash);
			expect(res.ok).toBe(true);
			expect(res.entries).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// same pathspec rule as the log: a project inside a bigger repo answers for its own subtree
	it('scopes to the opened folder when it is a subdirectory', async () => {
		const root = makeRepo();
		try {
			const log = await gitLog(root);
			const first = log.entries![1];
			writeFileSync(join(root, 'main.tex'), '\\documentclass{report}\n');

			const res = await gitChangesSince(join(root, 'chapters'), first.hash);
			expect(res.ok).toBe(true);
			// main.tex changed too, but it is outside the opened folder
			expect(res.entries).toEqual([{ path: join(root, 'chapters', 'methods.tex'), status: 'A' }]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// git octal-escapes any non-ASCII path, which then matches no file on disk - silently: the
	// panel looks populated and every row does nothing
	it('reads a non-ASCII path as the file it actually is', async () => {
		const root = makeRepo();
		try {
			const name = '第一章.tex';
			// committed, not just written: git diff reports tracked files only
			writeFileSync(join(root, 'chapters', name), 'Chapter one.\n');
			run(root, 'add', '-A');
			run(root, 'commit', '-q', '-m', 'Added the first chapter');

			const log = await gitLog(root);
			const before = log.entries![1]; // the version just before that commit

			const res = await gitChangesSince(root, before.hash);
			expect(res.ok).toBe(true);
			expect(res.entries).toEqual([{ path: join(root, 'chapters', name), status: 'A' }]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// a merge lists no files of its own, which is why the panel asks what DIFFERS from a version
	it('answers for a merge commit, which has no file list of its own', async () => {
		const root = makeRepo();
		try {
			run(root, 'checkout', '-q', '-b', 'side');
			writeFileSync(join(root, 'chapters', 'results.tex'), 'Results.\n');
			run(root, 'add', '-A');
			run(root, 'commit', '-q', '-m', 'Results on the side branch');
			run(root, 'checkout', '-q', '-');
			writeFileSync(join(root, 'refs.bib'), '@book{b,title={B}}\n');
			run(root, 'commit', '-q', '-am', 'Another reference');
			run(root, 'merge', '-q', '--no-ff', 'side', '-m', 'Merged the side branch');

			const log = await gitLog(root);
			expect(log.entries?.[0].subject).toBe('Merged the side branch');
			// where the straight rail stops being true, so the timeline marks it
			expect(log.entries?.[0].parentCount).toBe(2);
			expect(log.entries?.[1].parentCount).toBe(1);

			const res = await gitChangesSince(root, log.entries![0].hash);
			expect(res.ok).toBe(true);
			expect(res.entries).toEqual([]); // the merge IS the working copy, so nothing differs
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// not an ancestor of HEAD, but diff compares trees, so it answers - and restoring it is allowed
	it('compares against a version on a diverged branch', async () => {
		const root = makeRepo();
		try {
			run(root, 'checkout', '-q', '-b', 'side');
			writeFileSync(join(root, 'chapters', 'results.tex'), 'Results.\n');
			run(root, 'add', '-A');
			run(root, 'commit', '-q', '-m', 'Results on the side branch');
			const sideHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
			run(root, 'checkout', '-q', '-');

			const res = await gitChangesSince(root, sideHash);
			expect(res.ok).toBe(true);
			// the side branch has a file this branch never had: gone, relative to that version
			expect(res.entries).toEqual([{ path: join(root, 'chapters', 'results.tex'), status: 'D' }]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

// macOS temp dirs sit behind a symlink (/var -> /private/var) and git names the top level by the physical path
describe.skipIf(!AVAILABLE)('a folder opened through a symlink', () => {
	it('reads its history, with paths spelled the way the folder was opened', async () => {
		const real = makeRepo();
		const link = join(mkdtempSync(join(tmpdir(), 'texpile-gitlink-')), 'work');
		symlinkSync(real, link, 'junction');
		try {
			const log = await gitLog(join(link, 'chapters'));
			expect(log.ok).toBe(true);
			expect(log.entries?.map((e) => e.subject)).toEqual(['Rewrote the methods']);
			const first = (await gitLog(link)).entries?.at(-1)?.hash ?? '';
			const changes = await gitChangesSince(link, first);
			expect(changes.entries?.map((e) => e.path)).toEqual([join(link, 'chapters', 'methods.tex')]);
		} finally {
			rmSync(link);
			rmSync(dirname(link), { recursive: true, force: true });
			rmSync(real, { recursive: true, force: true });
		}
	});
});
