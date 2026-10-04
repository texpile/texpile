// What one version changed, and a project inside a larger repository, against real repos
// (gitLiveFixture.ts).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitChangesIn, gitFileAt, gitFileLog, gitShowAt } from '../../../../../../electron/src/git/history/gitHistory';
import { gitShowHead, gitStatus } from '../../../../../../electron/src/git/gitService';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs } from './gitLiveFixture';

afterEach(removeTempDirs);

function makeRepo(): string {
	const root = tempDir('texpile-version-');
	run(root, 'init', '-q');
	identify(root);
	return root;
}

describe.skipIf(!AVAILABLE)('what a version changed', () => {
	it('lists the first version as all additions, with nothing before it', async () => {
		const root = makeRepo();
		commit(root, 'main.tex', 'Hello.\n', 'First draft');
		const res = await gitChangesIn(root, out(root, 'rev-parse', 'HEAD'));
		expect(res).toEqual({ ok: true, parent: null, entries: [{ path: join(root, 'main.tex'), status: 'A' }] });
	});

	it('lists what it added, changed, removed and renamed, against the version before it', async () => {
		const root = makeRepo();
		writeFileSync(join(root, 'intro.tex'), 'An introduction long enough to be recognised after a rename.\n');
		writeFileSync(join(root, 'old.tex'), 'Old.\n');
		commit(root, 'main.tex', 'Hello.\n', 'First draft');
		const first = out(root, 'rev-parse', 'HEAD');
		run(root, 'mv', 'intro.tex', 'introduction.tex');
		run(root, 'rm', '-q', 'old.tex');
		writeFileSync(join(root, 'new.tex'), 'New.\n');
		commit(root, 'main.tex', 'Hello again.\n', 'Second draft');
		const second = out(root, 'rev-parse', 'HEAD');

		const res = await gitChangesIn(root, second);
		expect(res.parent).toBe(first);
		const byPath = Object.fromEntries((res.entries ?? []).map((e) => [e.path.slice(root.length + 1), e]));
		expect(byPath['main.tex'].status).toBe('M');
		expect(byPath['new.tex'].status).toBe('A');
		expect(byPath['old.tex'].status).toBe('D');
		expect(byPath['introduction.tex']).toEqual({ path: join(root, 'introduction.tex'), status: 'R', from: join(root, 'intro.tex') });

		// each side of the rename, read through the project folder
		expect((await gitFileAt(root, join(root, 'intro.tex'), first)).content).toContain('An introduction');
		expect((await gitFileAt(root, join(root, 'introduction.tex'), second)).content).toContain('An introduction');
		// a file that did not exist then is empty, not an error
		expect(await gitFileAt(root, join(root, 'new.tex'), first)).toEqual({ ok: true, hasHead: false, content: '' });
	});

	it('reads a file in a folder that has since been deleted', async () => {
		const root = makeRepo();
		mkdirSync(join(root, 'chapters'));
		commit(root, 'chapters/one.tex', 'One.\n', 'Add a chapter');
		const hash = out(root, 'rev-parse', 'HEAD');
		rmSync(join(root, 'chapters'), { recursive: true });
		expect((await gitFileAt(root, join(root, 'chapters', 'one.tex'), hash)).content).toBe('One.\n');
		// the deleted row's comparison with the last version, and with a version in History
		expect(await gitShowHead(join(root, 'chapters', 'one.tex'))).toEqual({ ok: true, hasHead: true, content: 'One.\n' });
		expect(await gitShowAt(join(root, 'chapters', 'one.tex'), hash)).toEqual({ ok: true, hasHead: true, content: 'One.\n' });
	});

	it('refuses anything that is not a version hash', async () => {
		const root = makeRepo();
		commit(root, 'main.tex', 'x\n', 'First');
		expect((await gitChangesIn(root, '--output=/tmp/x')).ok).toBe(false);
		expect((await gitChangesIn(root, 'HEAD')).ok).toBe(false);
		// a revision is never read as an option
		expect((await gitShowAt(join(root, 'main.tex'), '--output=/tmp/x')).ok).toBe(false);
		expect((await gitFileAt(root, join(root, 'main.tex'), '-p')).ok).toBe(false);
		expect((await gitShowAt(join(root, 'main.tex'), 'HEAD~1')).ok).toBe(true);
	});

	it('names each version of a file as it was called then, so one from before a rename opens', async () => {
		const root = makeRepo();
		commit(root, 'draft one.tex', 'A paragraph long enough to be recognised after a rename.\n', 'First');
		run(root, 'mv', 'draft one.tex', '章.tex');
		run(root, 'commit', '-q', '-m', 'Rename');
		commit(root, '章.tex', 'A paragraph long enough to be recognised after a rename.\nAnd more.\n', 'Third');
		const res = await gitFileLog(root, join(root, '章.tex'));
		expect(res.entries?.map((e) => [e.subject, e.path])).toEqual([
			['Third', undefined],
			['Rename', undefined],
			['First', join(root, 'draft one.tex')]
		]);
		const first = res.entries![2];
		expect((await gitFileAt(root, first.path!, first.hash)).content).toContain('A paragraph');
	});
});

describe.skipIf(!AVAILABLE)('a project inside a larger repository', () => {
	it('names where the repository starts', async () => {
		const home = makeRepo();
		commit(home, '.bashrc', 'alias ll=ls\n', 'Dotfiles');
		const paper = join(home, 'papers', 'thesis');
		mkdirSync(paper, { recursive: true });
		writeFileSync(join(paper, 'main.tex'), 'Hello.\n');
		const status = await gitStatus(paper);
		expect(status.repoRoot).toBe(home);
		// only this folder's files are listed, never the rest of that repository
		expect(status.entries?.map((e) => e.path)).toEqual([join(paper, 'main.tex')]);
		expect((await gitStatus(home)).repoRoot).toBe(home);
	});

	// the repository found above the folder was kept for the session: its rows all landed outside
	// the folder and were dropped, and a save committed nothing
	it('notices when the folder becomes a repository of its own', async () => {
		const home = makeRepo();
		commit(home, '.bashrc', 'alias ll=ls\n', 'Dotfiles');
		const paper = join(home, 'papers', 'thesis');
		mkdirSync(paper, { recursive: true });
		writeFileSync(join(paper, 'main.tex'), 'Hello.\n');
		expect((await gitStatus(paper)).repoRoot).toBe(home);

		run(paper, 'init', '-q');
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(Date.now() + 60_000);
			const status = await gitStatus(paper);
			expect(status.repoRoot).toBe(paper);
			expect(status.entries?.map((e) => e.path)).toEqual([join(paper, 'main.tex')]);
		} finally {
			vi.useRealTimers();
		}
	});
});
