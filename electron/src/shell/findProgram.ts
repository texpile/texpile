// a program on PATH by name, found the way a shell finds it: on Windows through PATHEXT, so the .cmd
// launchers npm and pnpm install count too
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathKey } from './toolDirs';

function runnable(file: string): boolean {
	try {
		if (!fs.statSync(file).isFile()) return false;
		if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** the program's full path, or null when PATH has no such program; call after shellEnvReady */
export function findProgram(name: string): string | null {
	if (path.isAbsolute(name)) return runnable(name) ? name : null;
	const dirs = (process.env[pathKey()] ?? '').split(path.delimiter).filter(Boolean);
	const exts =
		process.platform === 'win32' && !path.extname(name) ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
	for (const dir of dirs) {
		for (const ext of exts) {
			const file = path.join(dir, name + ext);
			if (runnable(file)) return file;
		}
	}
	return null;
}

/** Windows looks for a bare program name in the working folder before PATH, and that folder is often a project */
export const CWD_LOOKUP_OFF = 'NoDefaultCurrentDirectoryInExePath';

/** process-wide, before anything is spawned: Node and cmd.exe both honor it */
export function stopCwdProgramLookup(platform: NodeJS.Platform = process.platform): void {
	if (platform === 'win32') process.env[CWD_LOOKUP_OFF] = '1';
}
