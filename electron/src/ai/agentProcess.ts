// Starting the reader's agent without a shell, in a folder of its own, and the last thing it said
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// terminal colors, which an agent prints even into a pipe
const COLOR = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g');

/** a new empty folder for one run: the shared temp folder may hold files an agent would read as its instructions */
export function makeRunFolder(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-agent-'));
}

/** once the agent has exited; Windows will not remove a folder a running process is in */
export function removeRunFolder(dir: string): void {
	fs.rm(dir, { recursive: true, force: true }, () => {});
}

/** cmd.exe's own quoting, for the one case that needs its shell */
function cmdQuote(arg: string): string {
	return arg === '' || /[\s"&|<>^()%!,;=]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

export function startAgentProcess(program: string, args: string[], cwd: string, env?: Record<string, string>): ChildProcess {
	const options = { cwd, windowsHide: true, detached: process.platform !== 'win32', env: env && { ...process.env, ...env } };
	// npm and pnpm install command-line tools as .cmd launchers, which only cmd.exe can start
	if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(program)) {
		const line = [program, ...args].map(cmdQuote).join(' ');
		return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { ...options, windowsVerbatimArguments: true });
	}
	return spawn(program, args, options);
}

/** the last line that says something, for an error the reader can act on; a crash ends in stack frames */
export function lastLine(text: string): string | undefined {
	return text
		.replace(COLOR, '')
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && !/^at\s/.test(l) && !/^[\s[\]{}(),]+$/.test(l))
		.pop();
}
