// a lualatex still warming after the timeout stayed alive for the app's lifetime, blocked on
// stdin and unreachable by stop, the idle timer or window close; each later request spawned another
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawned = vi.hoisted(
	() => [] as Array<{ kill: ReturnType<typeof vi.fn>; stdout: PassThrough; stdin: { write: ReturnType<typeof vi.fn> } }>
);
// a program that is not on PATH: Node hands back the child, then emits ENOENT and never 'exit'
const engine = vi.hoisted(() => ({ missing: false }));
vi.mock('node:child_process', () => ({
	spawn: (cmd: string) => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
			stdin: { write: vi.fn() },
			kill: vi.fn(),
			pid: 4242
		});
		spawned.push(child);
		if (engine.missing) process.nextTick(() => child.emit('error', Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' })));
		return child;
	},
	execFile: vi.fn()
}));
vi.mock('../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: async () => {} }));

import { typesetParagraph } from '../../../../../electron/src/draft/draftDaemon';
import { applyToolDirs, pathKey, setToolDirs } from '../../../../../electron/src/shell/toolDirs';

afterEach(() => vi.useRealTimers());

describe('draft daemon warm timeout', () => {
	it('kills an engine that never reports ready and fails the request', async () => {
		vi.useFakeTimers();
		const root = mkdtempSync(join(tmpdir(), 'texd-warm-'));
		writeFileSync(join(root, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n');
		try {
			const request = typesetParagraph({ root, mainFile: 'main.tex', engineDir: root, text: 'x' });
			await vi.advanceTimersByTimeAsync(30_000);
			expect(await request).toEqual({ ok: false, error: 'daemon warm timeout' });
			expect(spawned).toHaveLength(1);
			expect(spawned[0].kill).toHaveBeenCalledWith('SIGKILL');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('fails the request at once when the engine cannot be started', async () => {
		engine.missing = true;
		const root = mkdtempSync(join(tmpdir(), 'texd-missing-'));
		writeFileSync(join(root, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n');
		try {
			const result = await typesetParagraph({ root, mainFile: 'main.tex', engineDir: root, text: 'x' });
			expect(result).toEqual({ ok: false, error: 'spawn lualatex ENOENT' });
		} finally {
			engine.missing = false;
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('warms a new engine once the Toolchain folders change which TeX is first', async () => {
		const root = mkdtempSync(join(tmpdir(), 'texd-switch-'));
		writeFileSync(join(root, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n');
		const savedPath = process.env[pathKey()];
		const body = { root, mainFile: 'main.tex', engineDir: root, text: 'x' };
		async function typesetOnNextEngine(): Promise<(typeof spawned)[number]> {
			const before = spawned.length;
			const request = typesetParagraph(body);
			await vi.waitFor(() => expect(spawned).toHaveLength(before + 1));
			const child = spawned[before];
			child.stdout.write('texpile-warm@@READY 345 550\n');
			await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalled());
			child.stdout.write('texpile-warm@@R {}\ntexpile-warm@@GEND\n');
			expect((await request).ok).toBe(true);
			return child;
		}
		try {
			const old = await typesetOnNextEngine();
			applyToolDirs();
			setToolDirs(['/usr/local/texlive/2024/bin/x86_64-linux']);
			expect(old.kill).toHaveBeenCalledWith('SIGKILL');
			await typesetOnNextEngine();
		} finally {
			setToolDirs([]);
			process.env[pathKey()] = savedPath;
			rmSync(root, { recursive: true, force: true });
		}
	});
});
