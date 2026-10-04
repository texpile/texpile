import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawned = vi.hoisted(() => [] as Array<{ kill: ReturnType<typeof vi.fn> }>);
vi.mock('node:child_process', () => ({
	spawn: () => {
		const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(), pid: 4243 });
		spawned.push(child);
		return child;
	},
	execFile: vi.fn()
}));
vi.mock('../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: async () => {} }));

import { rewarmCompiler, stopWarmCompiler } from '../../../../../electron/src/draft/draftWarmCompile';
import { applyToolDirs, pathKey, setToolDirs } from '../../../../../electron/src/shell/toolDirs';

it('lets go of the engine warmed on the old TeX once the Toolchain folders change', async () => {
	const root = mkdtempSync(join(tmpdir(), 'texd-warmc-'));
	writeFileSync(join(root, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n');
	const savedPath = process.env[pathKey()];
	try {
		rewarmCompiler(root, 'main.tex', root);
		await vi.waitFor(() => expect(spawned).toHaveLength(1), { timeout: 5000 });
		applyToolDirs();
		setToolDirs(['/usr/local/texlive/2024/bin/x86_64-linux']);
		expect(spawned[0].kill).toHaveBeenCalledWith('SIGKILL');
	} finally {
		stopWarmCompiler();
		setToolDirs([]);
		process.env[pathKey()] = savedPath;
		rmSync(root, { recursive: true, force: true });
	}
});
