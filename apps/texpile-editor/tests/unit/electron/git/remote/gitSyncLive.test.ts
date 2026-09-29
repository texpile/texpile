// Publishing a branch and syncing it, against real repos (gitLiveFixture.ts). Sign-in itself is
// covered by the askpass and GitHub tests.
import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gitStatus, gitIdentity, gitSetIdentity } from '../../../../../../../electron/src/git/gitService';
import { gitPublish, gitSync, gitPush, gitRemotes, gitAddRemote } from '../../../../../../../electron/src/git/remote/gitRemote';
import { gitFetch } from '../../../../../../../electron/src/git/remote/gitFetch';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs, makeUnpublished, makePublished } from '../gitLiveFixture';

afterEach(removeTempDirs);

describe.skipIf(!AVAILABLE)('publishing a branch', () => {
	it('is offered only once there is a version to publish', async () => {
		const root = tempDir('texpile-unborn-');
		run(root, 'init', '-q');
		const before = await gitStatus(root);
		expect(before.hasCommits).toBe(false);

		identify(root);
		commit(root, 'main.tex', 'x\n', 'First draft');
		expect((await gitStatus(root)).hasCommits).toBe(true);
	});

	it('sends the branch and makes the remote its upstream, so upload has somewhere to go', async () => {
		const { root, remote } = makeUnpublished();
		expect((await gitStatus(root)).tracking).toBeNull();

		expect((await gitAddRemote(root, 'origin', remote)).ok).toBe(true);
		expect((await gitRemotes(root)).remotes).toEqual([{ name: 'origin', url: remote }]);

		const res = await gitPublish(root, 'origin');
		expect(res).toMatchObject({ ok: true, remote: 'origin' });

		const after = await gitStatus(root);
		expect(after.tracking).toMatch(/^origin\//);
		expect(after.ahead).toBe(0);
		const branch = out(root, 'branch', '--show-current');
		expect(out(remote, 'log', '--format=%s', branch)).toBe('First draft');

		commit(root, 'main.tex', 'Changed.\n', 'Second draft');
		expect((await gitPush(root)).ok).toBe(true);
	});

	it('refuses a remote name or address that git would read as something else', async () => {
		const { root } = makeUnpublished();
		expect((await gitAddRemote(root, '--upload-pack=touch x', '/tmp/r.git')).ok).toBe(false);
		expect((await gitAddRemote(root, 'origin', '--upload-pack=touch x')).ok).toBe(false);
		expect((await gitAddRemote(root, 'origin', 'ext::sh -c touch% x')).ok).toBe(false);
		expect((await gitRemotes(root)).remotes).toEqual([]);
	});
});

describe.skipIf(!AVAILABLE)('syncing with the remote', () => {
	it('offers to publish again once the branch was deleted on the remote, instead of failing on every Sync', async () => {
		const { root, other } = await makePublished();
		const branch = out(root, 'branch', '--show-current');
		run(root, 'checkout', '-q', '-b', 'feature');
		run(root, 'push', '-q', '-u', 'origin', 'feature');
		// a merged pull request's branch, deleted on GitHub. No fetch.prune set here: Texpile prunes
		// by itself, or the branch would look alive and the next Sync would publish it again
		run(other, 'push', '-q', 'origin', '--delete', 'feature');
		commit(root, 'feature.tex', 'Feature.\n', 'Feature work');
		expect((await gitStatus(root)).tracking).toBe('origin/feature');

		expect(await gitSync(root)).toMatchObject({ ok: false, failure: 'no-upstream' });
		expect((await gitStatus(root)).tracking).toBeNull();
		expect(await gitFetch(root)).toMatchObject({ ok: false, failure: 'no-upstream' });
		expect(out(other, 'ls-remote', '--heads', 'origin', 'feature')).toBe('');
		// the branch it came from still syncs
		run(root, 'checkout', '-q', branch);
		expect((await gitStatus(root)).tracking).toBe(`origin/${branch}`);
	});

	it('takes in versions made elsewhere when there is nothing to send', async () => {
		const { root, other } = await makePublished();
		commit(other, 'refs.bib', '@book{a,title={A}}\n', 'Add a reference');
		run(other, 'push', '-q');

		const res = await gitSync(root);
		expect(res).toMatchObject({ ok: true, remote: 'origin', pulled: 1, pushed: 0 });
		expect(existsSync(join(root, 'refs.bib'))).toBe(true);
	});

	it('joins two lines of work that touched different files, and sends the result', async () => {
		const { root, other, remote } = await makePublished();
		commit(other, 'theirs.tex', 'Theirs.\n', 'Their version');
		run(other, 'push', '-q');
		commit(root, 'mine.tex', 'Mine.\n', 'My version');

		const res = await gitSync(root);
		expect(res.ok).toBe(true);
		expect(res.pulled).toBe(1);
		// my version and the merge that joined them
		expect(res.pushed).toBe(2);
		expect(existsSync(join(root, 'theirs.tex'))).toBe(true);
		const status = await gitStatus(root);
		expect(status.ahead).toBe(0);
		expect(status.behind).toBe(0);
		const branch = out(root, 'branch', '--show-current');
		expect(out(remote, 'log', '-1', '--format=%P', branch).split(' ')).toHaveLength(2);
	});

	it("names the version that joins them as it is told, not with git's remote-tracking words", async () => {
		const { root, other } = await makePublished();
		commit(other, 'theirs.tex', 'Theirs.\n', 'Their version');
		run(other, 'push', '-q');
		commit(root, 'mine.tex', 'Mine.\n', 'My version');

		expect((await gitSync(root, 'Joined with the versions on GitHub')).ok).toBe(true);
		expect(out(root, 'log', '-1', '--format=%B').trim()).toBe('Joined with the versions on GitHub');
		expect(out(root, 'log', '-1', '--format=%P').split(' ')).toHaveLength(2);
	});

	it('undoes the attempt when both sides changed the same lines, and names the file', async () => {
		const { root, other } = await makePublished();
		commit(other, 'main.tex', 'Their first line.\nSecond line.\n', 'Their edit');
		run(other, 'push', '-q');
		commit(root, 'main.tex', 'My first line.\nSecond line.\n', 'My edit');
		const head = out(root, 'rev-parse', 'HEAD');

		const res = await gitSync(root);
		expect(res).toMatchObject({ ok: false, failure: 'conflict', files: ['main.tex'] });

		// exactly as before: same version, no merge under way, no conflict markers in the file
		expect(out(root, 'rev-parse', 'HEAD')).toBe(head);
		expect(existsSync(join(root, '.git', 'MERGE_HEAD'))).toBe(false);
		expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('My first line.\nSecond line.\n');
		expect((await gitStatus(root)).entries).toEqual([]);
	});

	it('leaves unsaved work alone when an incoming version would overwrite it', async () => {
		const { root, other } = await makePublished();
		commit(other, 'main.tex', 'Their text.\n', 'Their edit');
		run(other, 'push', '-q');
		writeFileSync(join(root, 'main.tex'), 'Typed, not saved as a version.\n');

		const res = await gitSync(root);
		expect(res).toMatchObject({ ok: false, failure: 'dirty', files: [join(root, 'main.tex')] });
		expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('Typed, not saved as a version.\n');
	});

	it('joins two histories around unsaved work in a file only this side touched, leaving it unsaved', async () => {
		const { root, other } = await makePublished();
		commit(other, 'theirs.tex', 'Theirs.\n', 'Their version');
		run(other, 'push', '-q');
		commit(root, 'mine.tex', 'Mine.\n', 'My version');
		// unticked to stay on this computer: it must not have to be committed for Sync to go ahead
		writeFileSync(join(root, 'main.tex'), 'Half-written.\n');

		expect(await gitSync(root)).toMatchObject({ ok: true });
		expect(out(root, 'log', '-1', '--format=%P').split(' ')).toHaveLength(2);
		expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('Half-written.\n');
		expect(out(root, 'status', '--porcelain')).toBe('M main.tex');
	});

	it('will not join two histories over unsaved work in a file the other side changed too', async () => {
		const { root, other } = await makePublished();
		commit(other, 'main.tex', 'Their text.\n', 'Their edit');
		run(other, 'push', '-q');
		commit(root, 'notes.tex', 'Notes.\n', 'My version');
		writeFileSync(join(root, 'main.tex'), 'Half-written.\n');
		writeFileSync(join(root, 'notes.tex'), 'Unrelated, not saved.\n');
		const head = out(root, 'rev-parse', 'HEAD');

		const res = await gitSync(root);
		expect(res).toMatchObject({ ok: false, failure: 'dirty', files: [join(root, 'main.tex')] });
		expect(out(root, 'rev-parse', 'HEAD')).toBe(head);
		expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('Half-written.\n');
	});

	it('undoing a conflicted join leaves unsaved work in other files as it was', async () => {
		const { root, other } = await makePublished();
		commit(other, 'main.tex', 'Their first line.\nSecond line.\n', 'Their edit');
		run(other, 'push', '-q');
		commit(root, 'notes.tex', 'Notes.\n', 'Notes');
		commit(root, 'main.tex', 'My first line.\nSecond line.\n', 'My edit');
		writeFileSync(join(root, 'notes.tex'), 'Unrelated, not saved.\n');

		expect(await gitSync(root)).toMatchObject({ ok: false, failure: 'conflict', files: ['main.tex'] });
		expect(existsSync(join(root, '.git', 'MERGE_HEAD'))).toBe(false);
		expect(readFileSync(join(root, 'notes.tex'), 'utf8')).toBe('Unrelated, not saved.\n');
	});

	it('a branch tracking nothing has nothing to sync with', async () => {
		const { root } = makeUnpublished();
		expect(await gitSync(root)).toMatchObject({ ok: false, failure: 'no-upstream' });
	});
});

describe.skipIf(!AVAILABLE)("the author's own git configuration", () => {
	const saved = process.env.GIT_CONFIG_GLOBAL;
	afterEach(() => {
		if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL;
		else process.env.GIT_CONFIG_GLOBAL = saved;
	});

	it('reaches an upload: the environment goes through whole, not as one variable', async () => {
		// the remote's address only resolves through a global `insteadOf`. An upload that saw only
		// GIT_TERMINAL_PROMPT had no HOME and no GIT_CONFIG_GLOBAL, so it could not find it - nor a
		// credential helper configured the same way
		const { root, remote, dir } = makeUnpublished();
		const config = join(dir, 'global.gitconfig');
		writeFileSync(config, `[url "${remote}"]\n\tinsteadOf = elsewhere:thesis\n`);
		process.env.GIT_CONFIG_GLOBAL = config;

		expect((await gitAddRemote(root, 'origin', 'elsewhere:thesis')).ok).toBe(true);
		expect((await gitPublish(root, 'origin')).ok).toBe(true);
		commit(root, 'main.tex', 'Changed.\n', 'Second draft');
		expect((await gitPush(root)).ok).toBe(true);
	});

	it('sets the identity commits are made with, machine-wide', async () => {
		const dir = tempDir('texpile-ident-');
		process.env.GIT_CONFIG_GLOBAL = join(dir, 'global.gitconfig');
		writeFileSync(process.env.GIT_CONFIG_GLOBAL, '');
		run(dir, 'init', '-q');

		expect(await gitIdentity(dir)).toMatchObject({ name: null, email: null });
		expect((await gitSetIdentity(dir, ' Ada Lovelace ', 'ada@example.com')).ok).toBe(true);
		expect(await gitIdentity(dir)).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
		// an empty field leaves what was there
		expect((await gitSetIdentity(dir, '', 'countess@example.com')).ok).toBe(true);
		expect(await gitIdentity(dir)).toMatchObject({ name: 'Ada Lovelace', email: 'countess@example.com' });
	});
});
