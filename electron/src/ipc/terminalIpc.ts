// the node-pty shells behind the terminal dock, keyed by a renderer-chosen string id
import { app, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as typstService from '../typstService';
import { withPathDirs } from '../shell/pathDirs';
import { shellEnvReady } from '../shell/shellEnv';
import { killTree } from '../shell/killTree';
import { windowsPtyFor } from '../shell/windowsPty';
import { timeSync } from '../startupStats';

// node-pty is a native module: if it isn't built for this Electron ABI the require throws,
// so guard it and let the renderer show the terminal as unavailable
type Pty = typeof import('node-pty');
type PtyProcess = import('node-pty').IPty;
let pty: Pty | null = null;
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	pty = require('node-pty');
} catch (e) {
	console.error('node-pty unavailable, run `pnpm electron:rebuild`:', e instanceof Error ? e.message : e);
}
const ptys = new Map<string, PtyProcess>();
const windowsPty = windowsPtyFor(process.platform, os.release());
const execFileP = promisify(execFile);

/** pids of the shell's direct children: the foreground job a Stop should end */
async function childPids(pid: number): Promise<number[]> {
	try {
		const { stdout } =
			process.platform === 'win32'
				? await execFileP(
						'powershell.exe',
						['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}").ProcessId`],
						{ windowsHide: true }
					)
				: await execFileP('pgrep', ['-P', String(pid)]);
		return stdout
			.split(/\s+/)
			.map(Number)
			.filter((n) => n > 0);
	} catch {
		return []; // pgrep exits 1 when there are none
	}
}

function defaultShell(): string {
	if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe';
	// Finder-launched apps may lack SHELL, so fall back to the platform default
	if (process.platform === 'darwin') return process.env.SHELL || '/bin/zsh';
	return process.env.SHELL || '/bin/bash';
}

/**
 * The environment a terminal is spawned with: ours, plus the copy of tinymist we manage ourselves.
 *
 * Only a directory is added, never a command - the shell still resolves `tinymist` (or `latexmk`,
 * or anything else) by name, exactly as a user typing the same command by hand would, so a compile
 * command stays the same string on every machine.
 *
 * Nothing else needs adding: the user's own installs are on PATH, and shellEnvReady() has already
 * recovered the login-shell PATH this process was launched without.
 *
 * LAST on PATH, as resolveTinymist tries it last: a tinymist of the user's own must compile what
 * it also serves intellisense for. Added even before it exists, so a terminal opened before the
 * one-click install finds the copy the install puts there.
 */
function terminalEnv(): NodeJS.ProcessEnv {
	return withPathDirs(process.env, [path.dirname(typstService.managedTinymistPath(app.getPath('userData')))], true);
}

type TerminalSpawnOpts = {
	id?: string;
	cwd?: string;
	cols?: number;
	rows?: number;
};

/** will-quit teardown: every shell dies with the app */
export function killAllPtys(): void {
	for (const p of ptys.values()) {
		try {
			p.kill();
		} catch {
			/* ignore */
		}
	}
	ptys.clear();
}

export function registerTerminalIpc(): void {
	ipcMain.handle('terminal:available', () => pty != null);

	ipcMain.handle('terminal:spawn', async (e, { id, cwd, cols, rows }: TerminalSpawnOpts = {}) => {
		if (!pty) return { ok: false, error: 'node-pty is not built for this Electron build (run `pnpm electron:rebuild`).' };
		if (id == null) return { ok: false, error: 'Missing terminal id' };
		// terminalEnv() copies process.env, so the shell's PATH must already be in it
		await shellEnvReady();
		// `shell` tells the renderer which chaining syntax works for its done-sentinel
		// (cmd wants `&`, everything else `;`)
		const shellPath = defaultShell();
		const shell = shellPath.split(/[\\/]/).pop() ?? shellPath;
		if (ptys.has(id)) return { ok: true, shell, windowsPty };
		let proc: PtyProcess;
		try {
			// macOS: login shell, so /etc/zprofile runs path_helper and picks up /etc/paths.d
			// (MacTeX registers /Library/TeX/texbin there). A Finder-launched app only has
			// launchd's bare PATH, and a non-login zsh never repairs it - Terminal.app,
			// iTerm and VS Code all spawn login shells for the same reason.
			proc = timeSync('spawn terminal shell', () =>
				pty.spawn(shellPath, process.platform === 'darwin' ? ['-l'] : [], {
					name: 'xterm-color',
					cwd: cwd && fs.existsSync(cwd) ? cwd : app.getPath('home'),
					cols: Math.max(1, cols! | 0) || 80,
					rows: Math.max(1, rows! | 0) || 24,
					// the shell must be able to find the tools Preferences says are installed; without this a
					// configured tinymist works for intellisense and for the Toolchain tab, then fails at the
					// compile command with "not recognized" (see withPathDirs)
					env: terminalEnv() as Record<string, string>
				})
			);
		} catch (err) {
			return { ok: false, error: String(err instanceof Error ? err.message : err) };
		}
		const wc = e.sender;
		// a closing window runs none of its own teardown, so its shells end here
		function endWithWindow(): void {
			if (id == null || ptys.get(id) !== proc) return;
			ptys.delete(id);
			try {
				proc.kill();
			} catch {
				/* already gone */
			}
		}
		wc.once('destroyed', endWithWindow);
		// coalesce pty output: one renderer message per ~16ms tick (or 64KB burst) instead of
		// one per chunk -- a fast compile can emit thousands of tiny chunks per second
		let buf = '';
		let flushTimer: NodeJS.Timeout | null = null;
		function flush(): void {
			if (flushTimer) {
				clearTimeout(flushTimer);
				flushTimer = null;
			}
			if (!buf) return;
			const data = buf;
			buf = '';
			if (!wc.isDestroyed()) wc.send('terminal:data', { id, data });
		}
		proc.onData((data) => {
			buf += data;
			if (buf.length >= 64 * 1024) flush();
			else if (!flushTimer) flushTimer = setTimeout(flush, 16);
		});
		proc.onExit(({ exitCode }) => {
			wc.removeListener('destroyed', endWithWindow);
			ptys.delete(id);
			flush(); // pending output must land before the exit message, or the tail is lost
			if (!wc.isDestroyed()) wc.send('terminal:exit', { id, code: exitCode });
		});
		ptys.set(id, proc);
		return { ok: true, shell, windowsPty };
	});

	ipcMain.on('terminal:input', (_e, { id, data } = {} as { id?: string; data?: string }) => {
		const p = id != null ? ptys.get(id) : undefined;
		if (p && data != null) p.write(data);
	});

	ipcMain.on('terminal:resize', (_e, { id, cols, rows } = {} as { id?: string; cols?: number; rows?: number }) => {
		const p = id != null ? ptys.get(id) : undefined;
		if (!p) return;
		try {
			p.resize(Math.max(1, cols! | 0), Math.max(1, rows! | 0));
		} catch {
			/* a resize after exit can throw; ignore */
		}
	});

	// Stop for a compile. Not Ctrl+C: TeX answers an interrupt by dropping into its interactive
	// prompt, nonstopmode or not, and the next compile's command line then went into that prompt
	// as an answer. The shell stays; its foreground job and everything under it go.
	ipcMain.handle('terminal:interrupt', async (_e, { id } = {} as { id?: string }) => {
		const p = id != null ? ptys.get(id) : undefined;
		if (!p) return false;
		const jobs = await childPids(p.pid);
		for (const pid of jobs) killTree(pid);
		if (!jobs.length) p.write('\x03'); // nothing running under the shell: a plain interrupt is all there is
		return jobs.length > 0;
	});

	ipcMain.on('terminal:kill', (_e, { id } = {} as { id?: string }) => {
		const p = id != null ? ptys.get(id) : undefined;
		if (!p) return;
		try {
			p.kill();
		} catch {
			/* ignore */
		}
		if (id != null) ptys.delete(id);
	});
}
