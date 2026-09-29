// Cases that used to go wrong quietly, against real repositories (gitLiveFixture.ts): a restore that
// replaced a file no version had, or deleted one it could not write, a name git printed in quotes,
// a save that reached past the project folder or saved nothing and said it had, a hook reported as
// git missing, a clone whose files never arrived, a file name git took for an option, and a branch
// name that waited twenty seconds to be refused.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { gitStage, gitUnstage, gitStatus, isLocked } from '../../../../../../../electron/src/git/gitService';
import { gitChangesSince, gitCommit, gitFileLog, gitLog, gitRestore } from '../../../../../../../electron/src/git/history/gitHistory';
import { gitClone } from '../../../../../../../electron/src/git/remote/gitClone';
import { localGitReason } from '$lib/workspace/scm/gitLocalReason';
import { m } from '$lib/paraglide/messages';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs } from '../gitLiveFixture';

afterEach(removeTempDirs);

/** `vars` as git config for the length of `body`, the way GIT_CONFIG_COUNT gives it to every git */
async function withConfig<T>(vars: Record<string, string>, body: () => Promise<T>): Promise<T> {
	const env: Record<string, string> = { GIT_CONFIG_COUNT: String(Object.keys(vars).length) };
	Object.entries(vars).forEach(([k, v], i) => {
		env[`GIT_CONFIG_KEY_${i}`] = k;
		env[`GIT_CONFIG_VALUE_${i}`] = v;
	});
	const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
	Object.assign(process.env, env);
	try {
		return await body();
	} finally {
		for (const [k, v] of Object.entries(saved)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	}
}

function makeRepo(): string {
	const root = tempDir('texpile-awkward-');
	run(root, 'init', '-q');
	identify(root);
	return root;
}

describe.skipIf(!AVAILABLE)('restoring a version', () => {
	it('will not replace a new file that is in no version, and names it', async () => {
		const root = makeRepo();
		commit(root, 'abstract.tex', 'Old abstract.\n', 'With an abstract');
		const withAbstract = out(root, 'rev-parse', 'HEAD');
		run(root, 'rm', '-q', 'abstract.tex');
		run(root, 'commit', '-q', '-m', 'Drop the abstract');
		writeFileSync(join(root, 'abstract.tex'), 'A new abstract, never saved in a version.\n');

		const res = await gitRestore(root, withAbstract, 'Back to the abstract');
		expect(res).toMatchObject({ ok: false, untracked: [join(root, 'abstract.tex')] });
		expect(readFileSync(join(root, 'abstract.tex'), 'utf8')).toBe('A new abstract, never saved in a version.\n');
	});

	it('restores a file whose name git would print in quotes', async () => {
		const root = makeRepo();
		const name = 'Notes on "Hamlet".tex';
		commit(root, name, 'First reading.\n', 'First');
		const first = out(root, 'rev-parse', 'HEAD');
		commit(root, name, 'Second reading.\n', 'Second');

		expect((await gitChangesSince(root, first)).entries).toEqual([{ path: join(root, name), status: 'M' }]);
		expect((await gitRestore(root, first, 'Back to the first reading')).ok).toBe(true);
		expect(readFileSync(join(root, name), 'utf8')).toBe('First reading.\n');
	});

	it('will not replace a file .gitignore leaves out, and names it', async () => {
		const root = makeRepo();
		commit(root, 'notes.txt', 'Notes, once in a version.\n', 'With notes');
		const withNotes = out(root, 'rev-parse', 'HEAD');
		run(root, 'rm', '-q', '--cached', 'notes.txt');
		commit(root, '.gitignore', 'notes.txt\n', 'Keep the notes to myself');
		writeFileSync(join(root, 'notes.txt'), 'Notes kept only here since.\n');

		const res = await gitRestore(root, withNotes, 'Back to the notes');
		expect(res).toMatchObject({ ok: false, untracked: [join(root, 'notes.txt')] });
		expect(readFileSync(join(root, 'notes.txt'), 'utf8')).toBe('Notes kept only here since.\n');
	});

	// A Git LFS picture whose old version is no longer on the server: the checkout fails. That was
	// taken for "not in that version", so the picture was deleted and the deletion saved.
	it('fails, and puts back what it had done, when a file cannot be written as it was', async () => {
		const root = makeRepo();
		commit(root, '.gitattributes', 'fig.png filter=lfs-ish\n', 'Attributes');
		writeFileSync(join(root, 'a.tex'), 'A, first.\n');
		commit(root, 'fig.png', 'v1\n', 'First');
		const first = out(root, 'rev-parse', 'HEAD');
		writeFileSync(join(root, 'a.tex'), 'A, second.\n');
		writeFileSync(join(root, 'extra.tex'), 'Added since.\n');
		commit(root, 'fig.png', 'v2\n', 'Second');
		const second = out(root, 'rev-parse', 'HEAD');

		// the filter can write the new picture and not the old one
		const res = await withConfig(
			{
				'filter.lfs-ish.clean': 'cat',
				'filter.lfs-ish.smudge': 'c=$(cat); test "$c" != v1 && echo "$c"',
				'filter.lfs-ish.required': 'true'
			},
			() => gitRestore(root, first, 'Back to the first')
		);
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/smudge filter lfs-ish failed/);
		expect(out(root, 'rev-parse', 'HEAD')).toBe(second);
		expect(out(root, 'status', '--porcelain')).toBe('');
		expect(readFileSync(join(root, 'fig.png'), 'utf8')).toBe('v2\n');
		expect(readFileSync(join(root, 'a.tex'), 'utf8')).toBe('A, second.\n');
		expect(existsSync(join(root, 'extra.tex'))).toBe(true);
	});

	it('brings back a file that has since become a folder, and the other way round', async () => {
		const root = makeRepo();
		commit(root, 'figures', 'A file, first.\n', 'First');
		const first = out(root, 'rev-parse', 'HEAD');
		run(root, 'rm', '-q', 'figures');
		mkdirSync(join(root, 'figures'));
		commit(root, 'figures/one.png', 'A picture.\n', 'Figures folder');
		const second = out(root, 'rev-parse', 'HEAD');

		expect((await gitRestore(root, first, 'Back to the first')).ok).toBe(true);
		expect(readFileSync(join(root, 'figures'), 'utf8')).toBe('A file, first.\n');
		expect((await gitRestore(root, second, 'Back to the folder')).ok).toBe(true);
		expect(readFileSync(join(root, 'figures', 'one.png'), 'utf8')).toBe('A picture.\n');
		expect(out(root, 'status', '--porcelain')).toBe('');
	});

	it.skipIf(process.platform === 'win32')('fails when the version could not be saved', async () => {
		const root = makeRepo();
		commit(root, 'a.tex', 'A.\n', 'A');
		const first = out(root, 'rev-parse', 'HEAD');
		commit(root, 'a.tex', 'A, changed.\n', 'Change');
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(hook, '#!/bin/sh\nexit 1\n');
		chmodSync(hook, 0o755);

		expect((await gitRestore(root, first, 'Back to A')).ok).toBe(false);
	});

	it('refuses a revision that is not a version id', async () => {
		const root = makeRepo();
		commit(root, 'a.tex', 'A.\n', 'A');
		expect(await gitChangesSince(root, '--output=/tmp/x')).toMatchObject({ ok: false });
		expect(await gitRestore(root, '--output=/tmp/x', 'x')).toMatchObject({ ok: false });
	});
});

describe.skipIf(!AVAILABLE)('a project that is one folder of a larger repository', () => {
	it('saves a version without touching what was staged outside the folder', async () => {
		const root = makeRepo();
		mkdirSync(join(root, 'thesis'));
		mkdirSync(join(root, 'code'));
		commit(root, 'code/analysis.py', 'print(1)\n', 'Code');
		commit(root, 'thesis/main.tex', 'Thesis.\n', 'Thesis');
		// half of a change staged by hand in a terminal, the rest left out
		writeFileSync(join(root, 'code/analysis.py'), 'print(2)\n');
		run(root, 'add', 'code/analysis.py');
		writeFileSync(join(root, 'code/analysis.py'), 'print(3)\n');
		writeFileSync(join(root, 'thesis/main.tex'), 'Thesis, revised.\n');

		const project = join(root, 'thesis');
		await gitUnstage(project, []);
		await gitStage(project, []);
		expect(out(root, 'status', '--porcelain', '--', 'code')).toBe('MM code/analysis.py');
		expect(out(root, 'diff', '--cached', '--name-only')).toBe('code/analysis.py\nthesis/main.tex');

		// the version has what the panel listed, and what was staged outside is still staged
		expect(await gitCommit(project, 'Revise')).toEqual({ ok: true });
		expect(out(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('thesis/main.tex');
		expect(out(root, 'status', '--porcelain', '--', 'code')).toBe('MM code/analysis.py');
		expect(out(root, 'show', ':code/analysis.py')).toBe('print(2)');
	});

	it('saves new, deleted and renamed files in the folder while something outside it is staged', async () => {
		const root = makeRepo();
		mkdirSync(join(root, 'thesis'));
		mkdirSync(join(root, 'code'));
		writeFileSync(join(root, 'thesis/intro.tex'), 'An introduction long enough to be recognised after a rename.\n');
		writeFileSync(join(root, 'thesis/old.tex'), 'Old.\n');
		commit(root, 'code/analysis.py', 'print(1)\n', 'First');
		writeFileSync(join(root, 'code/analysis.py'), 'print(2)\n');
		run(root, 'add', 'code/analysis.py');
		renameSync(join(root, 'thesis/intro.tex'), join(root, 'thesis/introduction.tex'));
		execFileSync('rm', [join(root, 'thesis/old.tex')]);
		writeFileSync(join(root, 'thesis/new.tex'), 'New.\n');

		const project = join(root, 'thesis');
		const rows = (await gitStatus(project)).entries ?? [];
		await gitUnstage(project, []);
		await gitStage(project, [...rows.map((r) => r.path), join(project, 'intro.tex')]);
		expect(await gitCommit(project, 'Rework the thesis')).toEqual({ ok: true });
		expect(out(root, 'show', '--name-status', '--format=', 'HEAD').split('\n')).toEqual([
			'R100\tthesis/intro.tex\tthesis/introduction.tex',
			'A\tthesis/new.tex',
			'D\tthesis/old.tex'
		]);
		expect(out(root, 'status', '--porcelain')).toBe('M  code/analysis.py');
	});

	it('saves nothing, and says so, when only something outside the folder is staged', async () => {
		const root = makeRepo();
		mkdirSync(join(root, 'thesis'));
		mkdirSync(join(root, 'code'));
		commit(root, 'code/analysis.py', 'print(1)\n', 'Code');
		commit(root, 'thesis/main.tex', 'Thesis.\n', 'Thesis');
		writeFileSync(join(root, 'code/analysis.py'), 'print(2)\n');
		run(root, 'add', 'code/analysis.py');
		const head = out(root, 'rev-parse', 'HEAD');

		const res = await gitCommit(join(root, 'thesis'), 'Nothing here');
		expect(res.ok).toBe(false);
		expect(localGitReason(res.error)).toBe(m.vcs_error_nothing());
		expect(out(root, 'rev-parse', 'HEAD')).toBe(head);
	});

	it('lists only its own changes, a rename inside it among them', async () => {
		const root = makeRepo();
		mkdirSync(join(root, 'thesis'));
		mkdirSync(join(root, 'code'));
		writeFileSync(join(root, 'thesis/intro.tex'), 'An introduction long enough to be recognised after a rename.\n');
		commit(root, 'code/analysis.py', 'print(1)\n', 'First');
		writeFileSync(join(root, 'code/analysis.py'), 'print(2)\n');
		writeFileSync(join(root, 'code/new.py'), 'print(3)\n');
		run(root, 'mv', 'thesis/intro.tex', 'thesis/introduction.tex');
		writeFileSync(join(root, 'thesis/notes.tex'), 'Notes.\n');

		const project = join(root, 'thesis');
		expect((await gitStatus(project)).entries).toEqual([
			{ path: join(project, 'introduction.tex'), x: 'R', y: ' ', from: join(project, 'intro.tex') },
			{ path: join(project, 'notes.tex'), x: '?', y: '?' }
		]);
	});
});

describe.skipIf(!AVAILABLE)('saving a version', () => {
	it('fails, in the words for it, when there is nothing to save', async () => {
		const root = makeRepo();
		commit(root, 'a.tex', 'A.\n', 'A');
		const res = await gitCommit(root, 'Nothing new');
		expect(res.ok).toBe(false);
		expect(localGitReason(res.error)).toBe(m.vcs_error_nothing());
	});

	it.skipIf(process.platform === 'win32')('fails when a hook refuses it without a word', async () => {
		const root = makeRepo();
		commit(root, 'a.tex', 'A.\n', 'A');
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(hook, '#!/bin/sh\nexit 1\n');
		chmodSync(hook, 0o755);
		writeFileSync(join(root, 'a.tex'), 'A, changed.\n');
		await gitStage(root, [join(root, 'a.tex')]);
		expect((await gitCommit(root, 'Change')).ok).toBe(false);
	});

	it('stages files whose names git would read as options', async () => {
		const root = makeRepo();
		commit(root, 'main.tex', 'Main.\n', 'First');
		writeFileSync(join(root, '-draft.tex'), 'A draft.\n');
		writeFileSync(join(root, '-n'), 'Not a dry run.\n');
		expect(await gitStage(root, [join(root, '-draft.tex'), join(root, '-n')])).toEqual({ ok: true });
		expect(out(root, 'diff', '--cached', '--name-only').split('\n')).toEqual(['-draft.tex', '-n']);
	});
});

describe.skipIf(!AVAILABLE)('a file whose name starts with two dots', () => {
	it('is inside the folder: listed, and its history read', async () => {
		const root = makeRepo();
		mkdirSync(join(root, 'thesis'));
		commit(root, 'thesis/..notes.tex', 'Notes.\n', 'Notes');
		const first = out(root, 'rev-parse', 'HEAD');
		writeFileSync(join(root, 'thesis/..notes.tex'), 'Notes, more.\n');

		const project = join(root, 'thesis');
		const file = join(project, '..notes.tex');
		expect((await gitStatus(project)).entries?.map((e) => e.path)).toEqual([file]);
		expect((await gitFileLog(project, file)).entries?.map((e) => e.subject)).toEqual(['Notes']);
		expect((await gitChangesSince(project, first)).entries).toEqual([{ path: file, status: 'M' }]);
	});
});

describe.skipIf(!AVAILABLE)('an author who has git show signatures in the log', () => {
	let signing = true;
	try {
		execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' });
	} catch (e) {
		// ssh-keygen exits 1 on -?, which is being there; not being there is ENOENT
		signing = (e as { code?: string }).code !== 'ENOENT';
	}

	it.skipIf(!signing)('reads only the versions, not the signature check', async () => {
		const root = makeRepo();
		const key = join(tempDir('texpile-key-'), 'key');
		execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
		commit(root, 'a.tex', 'A.\n', 'Unsigned');
		writeFileSync(join(root, 'a.tex'), 'A, signed.\n');
		run(root, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'commit', '-q', '-S', '-am', 'Signed');
		run(root, 'config', 'log.showSignature', 'true');

		expect((await gitLog(root)).entries?.map((e) => e.subject)).toEqual(['Signed', 'Unsigned']);
		expect((await gitFileLog(root, join(root, 'a.tex'))).entries?.map((e) => e.subject)).toEqual(['Signed', 'Unsigned']);
	});
});

describe.skipIf(!AVAILABLE || process.platform === 'win32')('a hook that fails', () => {
	it("is reported in its own words, not as git missing, when it runs a tool that isn't there", async () => {
		const root = makeRepo();
		commit(root, 'a.tex', 'A.\n', 'A');
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(hook, '#!/bin/bash\nlint-staged-that-is-not-installed\n');
		chmodSync(hook, 0o755);
		writeFileSync(join(root, 'a.tex'), 'A, changed.\n');
		run(root, 'add', 'a.tex');
		const res = await gitCommit(root, 'Change');
		expect(res.ok).toBe(false);
		expect(res.reason).toBeUndefined();
		expect(res.error).toMatch(/command not found/);
	});
});

describe.skipIf(!AVAILABLE)('a clone whose files could not be written', () => {
	it('fails as such, and leaves no half-made folder behind', async () => {
		const source = makeRepo();
		commit(source, '.gitattributes', 'fig.png filter=broken\n', 'Attributes');
		commit(source, 'fig.png', 'not really a picture\n', 'Figure');
		const parent = tempDir('texpile-clone-');
		// a filter that must run and fails, as a Git LFS download that fails does
		const saved = { ...process.env };
		Object.assign(process.env, {
			GIT_CONFIG_COUNT: '2',
			GIT_CONFIG_KEY_0: 'filter.broken.smudge',
			GIT_CONFIG_VALUE_0: 'false',
			GIT_CONFIG_KEY_1: 'filter.broken.required',
			GIT_CONFIG_VALUE_1: 'true'
		});
		try {
			const res = await gitClone(source, parent, 'paper');
			expect(res).toMatchObject({ ok: false, failure: 'checkout' });
			expect(existsSync(join(parent, 'paper'))).toBe(false);
		} finally {
			for (const k of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_1']) {
				if (saved[k] === undefined) delete process.env[k];
				else process.env[k] = saved[k];
			}
		}
	});
});

describe('a ref name another one is in the way of', () => {
	// a fetch can meet it too: "draft/v2" on the remote beside a "draft" this copy still has
	it('is not taken for a lock, so it is not retried for 19 seconds', () => {
		expect(isLocked(new Error("error: cannot lock ref 'refs/remotes/origin/draft/v2': 'refs/remotes/origin/draft' exists"))).toBe(false);
		expect(isLocked(new Error("fatal: Unable to create '/p/.git/index.lock': File exists."))).toBe(true);
		expect(isLocked(new Error("error: cannot lock ref 'refs/heads/main': is at 1a2b but expected 3c4d"))).toBe(true);
	});
});
