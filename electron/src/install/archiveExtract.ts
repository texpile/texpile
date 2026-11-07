// Unpack a release archive with the system's own tar, and find the program inside it
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TinymistInstallError } from './tinymistInstallError';

const EXTRACT_TIMEOUT_MS = 120_000;

/**
 * The tar that can read the archive.
 *
 * On Windows that is the bsdtar Windows 10 1803 and later ship in System32, named by absolute path:
 * it reads zip as well as tar, where a GNU tar from Git or MSYS earlier on PATH cannot. Chosen over
 * PowerShell's Expand-Archive (slow, and at the mercy of execution policy and profile scripts) and
 * over a zip library in the main bundle for a single file. Elsewhere any tar on PATH reads .tar.gz.
 */
export function tarCommand(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
	if (platform !== 'win32') return 'tar';
	return path.win32.join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'tar.exe');
}

export function extractArchive(archive: string, format: 'zip' | 'tar.gz', into: string, platform = process.platform): Promise<void> {
	const args = format === 'zip' ? ['-xf', archive, '-C', into] : ['-xzf', archive, '-C', into];
	return new Promise((resolve, reject) => {
		execFile(tarCommand(platform, process.env), args, { timeout: EXTRACT_TIMEOUT_MS, windowsHide: true }, (err, _stdout, stderr) => {
			if (!err) return resolve();
			const said = String(stderr).trim().split(/\r?\n/)[0];
			reject(TinymistInstallError.from(said ? Object.assign(new Error(said), { code: diskCode(said) }) : err, 'extract'));
		});
	});
}

// tar reports a full disk in its own words rather than with an errno the caller can read
function diskCode(said: string): string | undefined {
	if (/no space left|disk quota/i.test(said)) return 'ENOSPC';
	if (/permission denied|read-only file system/i.test(said)) return 'EACCES';
	return undefined;
}

/**
 * The program in an unpacked archive: `tinymist-<target>/tinymist` in a tarball, `tinymist.exe` at
 * the top of a zip. Looks one folder deep either way rather than trusting the layout.
 */
export function findProgram(dir: string, file: string): string | null {
	const top = path.join(dir, file);
	if (isFile(top)) return top;
	for (const entry of safeList(dir)) {
		if (!entry.isDirectory()) continue;
		const nested = path.join(dir, entry.name, file);
		if (isFile(nested)) return nested;
	}
	return null;
}

function isFile(p: string): boolean {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
}

function safeList(dir: string): fs.Dirent[] {
	try {
		return fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}
