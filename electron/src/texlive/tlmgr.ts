// TeX Live's own package manager, run from Texpile's tree
import { execFile } from 'node:child_process';
import * as path from 'node:path';

// a package list download and a large package on a slow connection
const TIMEOUT_MS = 10 * 60_000;

export function runTlmgr(bin: string, args: string[]): Promise<{ code: number; out: string }> {
	const win = process.platform === 'win32';
	const tlmgr = path.join(bin, win ? 'tlmgr.bat' : 'tlmgr');
	// Node starts a .bat only through cmd; every argument is a fixed word, a URL or a checked package or file name
	return new Promise((resolve) => {
		execFile(
			win ? `"${tlmgr}"` : tlmgr,
			args,
			{ shell: win, timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
			(err, stdout, stderr) => {
				const code = (err as { code?: unknown } | null)?.code;
				resolve({ code: err ? (typeof code === 'number' ? code : 1) : 0, out: `${stdout}\n${stderr}` });
			}
		);
	});
}
