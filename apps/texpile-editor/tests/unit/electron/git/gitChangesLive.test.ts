// The changes list against real repositories (gitLiveFixture.ts), where it used to differ from VS
// Code in ways that lost work: a staged rename saved as half of itself, Discard doing nothing to a
// staged change, a repository inside the project ticked into the next version, and a folder row
// whose Delete would have taken ignored files with it.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gitStatus, gitDiscard, gitUnstage, gitStage } from '../../../../../../electron/src/git/gitService';
import { gitCommit } from '../../../../../../electron/src/git/history/gitHistory';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs } from './gitLiveFixture';

afterEach(removeTempDirs);

function makeRepo(): string {
	const root = tempDir('texpile-changes-');
	run(root, 'init', '-q');
	identify(root);
	commit(root, 'intro.tex', 'An introduction long enough to be recognised after a rename.\n', 'First draft');
	return root;
}

describe.skipIf(!AVAILABLE)('the changes list', () => {
	it('keeps a staged rename whole when it is saved: the new name in, the old one out', async () => {
		const root = makeRepo();
		run(root, 'mv', 'intro.tex', 'introduction.tex');
		const row = (await gitStatus(root)).entries?.find((e) => e.path.endsWith('introduction.tex'));
		expect(row).toMatchObject({ x: 'R', from: join(root, 'intro.tex') });
		// what Save version does with that row ticked (scmActions.svelte.ts): reset, add, commit
		await gitUnstage(root, []);
		await gitStage(root, [row!.path, row!.from!]);
		expect((await gitCommit(root, 'Rename')).ok).toBe(true);
		expect(out(root, 'ls-tree', '--name-only', 'HEAD')).toBe('introduction.tex');
		expect((await gitStatus(root)).entries).toEqual([]);
	});

	it('puts back a change that was staged, and a deletion that was staged', async () => {
		const root = makeRepo();
		writeFileSync(join(root, 'intro.tex'), 'Rewritten.\n');
		run(root, 'add', 'intro.tex');
		expect((await gitDiscard(root, [join(root, 'intro.tex')])).ok).toBe(true);
		expect(readFileSync(join(root, 'intro.tex'), 'utf8')).toContain('An introduction');

		run(root, 'rm', '-q', 'intro.tex');
		expect((await gitDiscard(root, [join(root, 'intro.tex')])).ok).toBe(true);
		expect(existsSync(join(root, 'intro.tex'))).toBe(true);
		expect((await gitStatus(root)).entries).toEqual([]);
	});

	it('leaves out a repository inside the project, which is not a file of its own', async () => {
		const root = makeRepo();
		const inner = join(root, 'template');
		mkdirSync(inner);
		run(inner, 'init', '-q');
		identify(inner);
		commit(inner, 'class.cls', '% a class\n', 'Class');
		writeFileSync(join(root, 'notes.tex'), 'Notes.\n');
		expect((await gitStatus(root)).entries?.map((e) => e.path)).toEqual([join(root, 'notes.tex')]);
	});

	it('lists a name that starts or ends with a space under that name, and saves it', async () => {
		const root = makeRepo();
		commit(root, ' notes.tex', 'Notes.\n', 'Notes');
		writeFileSync(join(root, ' notes.tex'), 'Notes, edited.\n');
		writeFileSync(join(root, 'draft.tex '), 'Draft.\n');
		const rows = (await gitStatus(root)).entries ?? [];
		expect(rows).toEqual([
			{ path: join(root, ' notes.tex'), x: ' ', y: 'M' },
			{ path: join(root, 'draft.tex '), x: '?', y: '?' }
		]);
		await gitUnstage(root, []);
		await gitStage(
			root,
			rows.map((r) => r.path)
		);
		expect((await gitCommit(root, 'Notes and a draft')).ok).toBe(true);
		expect((await gitStatus(root)).entries).toEqual([]);
	});

	it('marks a folder row that also holds ignored files, so it is never deleted whole', async () => {
		const root = makeRepo();
		writeFileSync(join(root, '.gitignore'), '*.log\n');
		commit(root, '.gitignore', '*.log\n', 'Ignore logs');
		for (const name of ['data', 'figures']) {
			mkdirSync(join(root, name));
			for (let i = 0; i < 200; i++) writeFileSync(join(root, name, `f${i}.csv`), `${i}\n`);
		}
		writeFileSync(join(root, 'data', 'run.log'), 'kept out of versions\n');
		const rows = (await gitStatus(root)).entries ?? [];
		expect(rows.find((e) => e.path === join(root, 'data'))).toMatchObject({ files: 200, ignoredInside: true });
		expect(rows.find((e) => e.path === join(root, 'figures'))).toMatchObject({ files: 200 });
		expect(rows.find((e) => e.path === join(root, 'figures'))?.ignoredInside).toBeUndefined();
	});
});
