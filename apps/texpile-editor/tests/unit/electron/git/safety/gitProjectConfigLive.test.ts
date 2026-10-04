// A project that arrives with its own .git/config can name a program for git to run on every status
// (core.fsmonitor). Opening the folder runs a status, so that program ran without anyone asking.
import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitStatus } from '../../../../../../../electron/src/git/gitService';
import { AVAILABLE, run, identify, commit, tempDir, removeTempDirs } from '../gitLiveFixture';

afterEach(removeTempDirs);

describe.skipIf(!AVAILABLE || process.platform === 'win32')("a project's own git config", () => {
	it('runs no file system monitor the project names when its status is read', async () => {
		const root = tempDir('texpile-fsmonitor-');
		run(root, 'init', '-q');
		identify(root);
		commit(root, 'main.tex', 'Hello.\n', 'First');
		const ran = join(root, 'ran');
		const monitor = join(root, 'monitor.sh');
		writeFileSync(monitor, `#!/bin/sh\ntouch '${ran}'\n`);
		chmodSync(monitor, 0o755);
		run(root, 'config', 'core.fsmonitor', monitor);
		writeFileSync(join(root, 'main.tex'), 'Hello again.\n');
		const status = await gitStatus(root);
		expect(status.ok).toBe(true);
		expect(existsSync(ran)).toBe(false);
	});
});
