// GUI launches on macOS/Linux inherit launchd's bare PATH, so TeX, git and synctex are invisible
// even when the user's terminal finds them. Recover the real PATH from a login shell.
//
// Off the launch path, unlike the execFileSync this replaces: an interactive login shell sources
// the user's whole rc chain, which blocked every window behind however long that took. Awaited at
// each spawn site instead, so a slow shell delays only the first compile.
//
// Deviation from the model (VS Code's shellEnv.ts): the resolved PATH is assigned into process.env
// rather than passed per-spawn, because simple-git cannot take a spread environment (gitService.ts)
// and git inherits ours.
import { probeLoginShell } from './probeLoginShell';

const TIMEOUT_MS = 10_000;

// MacTeX and the package managers install here. Linux TeX Live paths are version-stamped, so the
// probe is the only mechanism there.
const MAC_DIRS = ['/Library/TeX/texbin', '/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin'];

let pending: Promise<void> | null = null;
let failure: string | null = null;

/** why the probe failed, for a caller that wants to report it; null while it worked or was skipped */
export function shellEnvError(): string | null {
	return failure;
}

/** resolves once process.env.PATH is the user's. Await before spawning any external program. */
export function shellEnvReady(): Promise<void> {
	return (pending ??= resolveShellEnv());
}

function appendMacDirs(): void {
	if (process.platform !== 'darwin') return;
	const dirs = (process.env.PATH || '').split(':').filter(Boolean);
	for (const d of MAC_DIRS) if (!dirs.includes(d)) dirs.push(d);
	process.env.PATH = dirs.join(':');
}

async function resolveShellEnv(): Promise<void> {
	if (process.platform === 'win32') return;
	if (process.env.TEXPILE_DISABLE_SHELL_ENV) return;
	try {
		const env = await probeLoginShell(TIMEOUT_MS);
		const key = Object.keys(env).find((k) => k.toLowerCase() === 'path');
		if (key && env[key]) process.env.PATH = env[key];
	} catch (err) {
		failure = err instanceof Error ? err.message : String(err);
		console.error('shell environment could not be resolved:', failure);
	}
	appendMacDirs();
}
