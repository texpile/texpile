// git that takes its time, against real repositories (gitLiveFixture.ts). A hook, a signing prompt
// or a Git LFS download can be silent for longer than the 20 seconds after which the shared factory
// gives up, and a commit killed there was reported failed half-way through. The automatic check for
// new versions is the other way round: nobody is waiting on it, so a connection that stalled must
// not keep it, and the Sync that waits for it, pending for ever.
import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitStage } from '../../../../../../../electron/src/git/gitService';
import { gitCommit } from '../../../../../../../electron/src/git/history/gitHistory';
import { gitFetch } from '../../../../../../../electron/src/git/remote/gitFetch';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs, makePublished } from '../gitLiveFixture';

afterEach(removeTempDirs);

describe.skipIf(!AVAILABLE || process.platform === 'win32')('a hook that takes a while', () => {
	it('is waited for, however long it says nothing', { timeout: 60_000 }, async () => {
		const root = tempDir('texpile-patience-');
		run(root, 'init', '-q');
		identify(root);
		commit(root, 'a.tex', 'A.\n', 'A');
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(hook, '#!/bin/sh\nsleep 21\n');
		chmodSync(hook, 0o755);
		writeFileSync(join(root, 'a.tex'), 'A, changed.\n');
		await gitStage(root, [join(root, 'a.tex')]);

		expect(await gitCommit(root, 'After the hook')).toEqual({ ok: true });
		expect(out(root, 'log', '-1', '--format=%s')).toBe('After the hook');
	});
});

describe.skipIf(!AVAILABLE || process.platform === 'win32')('the automatic check for new versions', () => {
	// the remote answers only after `seconds`: upload-pack is what a fetch from a path talks to
	function slowRemote(root: string, seconds: number) {
		run(root, 'config', 'remote.origin.uploadpack', `sleep ${seconds}; git-upload-pack`);
	}

	it('gives up on a connection that says nothing', { timeout: 30_000 }, async () => {
		const { root } = await makePublished();
		slowRemote(root, 8);
		const started = Date.now();
		const res = await gitFetch(root, {}, 1000);
		expect(res.ok).toBe(false);
		expect(Date.now() - started).toBeLessThan(6000);
	});

	it('still fetches from one that is only slow to start, when someone asked for it', { timeout: 30_000 }, async () => {
		const { root, other } = await makePublished();
		commit(other, 'main.tex', 'Their line.\n', 'Their edit');
		run(other, 'push', '-q');
		slowRemote(root, 2);
		expect(await gitFetch(root)).toMatchObject({ ok: true, behind: 1 });
	});

	it('fetches as before when the remote answers', { timeout: 30_000 }, async () => {
		const { root, other } = await makePublished();
		commit(other, 'main.tex', 'Their line.\n', 'Their edit');
		run(other, 'push', '-q');
		expect(await gitFetch(root, {}, 1000)).toMatchObject({ ok: true, behind: 1 });
	});
});
