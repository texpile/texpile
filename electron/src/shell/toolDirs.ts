// the folders Preferences adds in front of PATH, for every program Texpile starts
import * as path from 'node:path';
import { withPathDirs } from './pathDirs';

let configured: string[] = [];
// PATH as the login shell gave it, before any of the user's folders; null until shellEnv has run
let baseline: string | null = null;
const listeners = new Set<(pathValue: string) => void>();

// relative entries count from the portable zip's folder, or the folder holding the AppImage file
export function appDir(): string {
	return path.dirname(process.env.APPIMAGE || process.execPath);
}

export function pathKey(): string {
	return Object.keys(process.env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
}

export function resolveToolDir(entry: string, base = appDir()): string {
	return path.isAbsolute(entry) ? entry : path.resolve(base, entry);
}

/** both spellings of a folder; relative only for a portable app and only on its own drive */
export function dirForms(entry: string, portable: boolean, base = appDir()): { absolute: string; relative: string | null } {
	const absolute = resolveToolDir(entry, base);
	const shared = path.parse(absolute).root.toLowerCase() === path.parse(base).root.toLowerCase();
	return { absolute, relative: portable && shared ? path.relative(base, absolute) || '.' : null };
}

function folderKey(p: string): string {
	const bare = p.replace(/[\\/]+$/, '');
	return process.platform === 'win32' ? bare.toLowerCase() : bare;
}

// a listed folder already on PATH moves to the front: listing it means it wins
function apply(): void {
	const key = pathKey();
	const sep = process.platform === 'win32' ? ';' : ':';
	const resolved = configured.map((d) => resolveToolDir(d));
	const listed = new Set(resolved.map(folderKey));
	const rest = (baseline ?? '').split(sep).filter((p) => p && !listed.has(folderKey(p)));
	process.env[key] = withPathDirs({ [key]: rest.join(sep) }, resolved)[key];
	for (const fn of listeners) fn(process.env[key] ?? '');
}

/** for a process holding its own copy of the environment */
export function onToolPathChange(fn: (pathValue: string) => void): void {
	listeners.add(fn);
}

/** the folders from Preferences, as they go in front of PATH */
export function toolDirsInFront(): string[] {
	return configured.map((d) => resolveToolDir(d));
}

/** PATH without the folders from Preferences */
export function baselinePath(): string {
	return baseline ?? process.env[pathKey()] ?? '';
}

/** takes effect once the shell PATH is known */
export function setToolDirs(dirs: unknown): void {
	configured = Array.isArray(dirs) ? dirs.filter((d): d is string => typeof d === 'string' && d.trim() !== '') : [];
	if (baseline !== null) apply();
}

/** call once process.env.PATH is the user's own */
export function applyToolDirs(): void {
	baseline ??= process.env[pathKey()] ?? '';
	apply();
}
