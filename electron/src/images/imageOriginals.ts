// The original of each image the image tab overwrites: one copy per file, the one before its first edit, kept apart
// from Local History so photos never push a paper's text history out
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** `written`: the file's mtime after the app last wrote it; a file changed since is a new image with no original here */
type KeptOriginal = { path: string; at: number; size: number; written?: number };

function slotOf(home: string, path: string): string {
	return join(home, createHash('sha1').update(path).digest('hex'));
}

async function keptIn(slot: string): Promise<KeptOriginal | null> {
	try {
		return JSON.parse(await readFile(join(slot, 'original.json'), 'utf8')) as KeptOriginal;
	} catch {
		return null;
	}
}

async function prune(home: string, now: number): Promise<void> {
	const slots = await readdir(home).catch(() => [] as string[]);
	const kept: (KeptOriginal & { slot: string })[] = [];
	for (const name of slots) {
		const slot = join(home, name);
		const original = await keptIn(slot);
		if (!original || now - original.at > KEEP_MS) await rm(slot, { recursive: true, force: true });
		else kept.push({ ...original, slot });
	}
	let total = kept.reduce((sum, k) => sum + k.size, 0);
	for (const k of kept.sort((a, b) => a.at - b.at)) {
		if (total <= MAX_TOTAL_BYTES) break;
		total -= k.size;
		await rm(k.slot, { recursive: true, force: true });
	}
}

/** keeps the file as it is now, unless an original of it is kept already */
export async function keepOriginal(home: string, path: string, now = Date.now()): Promise<void> {
	const slot = slotOf(home, path);
	if (await keptIn(slot)) return;
	const { size } = await stat(path);
	await mkdir(slot, { recursive: true });
	await cp(path, join(slot, basename(path)));
	const original: KeptOriginal = { path, at: now, size };
	await writeFile(join(slot, 'original.json'), JSON.stringify(original));
	await prune(home, now);
}

/** the app wrote the file: what it holds now is the edit the original stands behind */
export async function noteWritten(home: string, path: string): Promise<void> {
	const slot = slotOf(home, path);
	const original = await keptIn(slot);
	if (!original) return;
	const { mtimeMs } = await stat(path);
	await writeFile(join(slot, 'original.json'), JSON.stringify({ ...original, written: mtimeMs }));
}

/** the original kept for the file, dropped when the file changed since the app last wrote it */
async function currentOriginal(home: string, path: string): Promise<KeptOriginal | null> {
	const slot = slotOf(home, path);
	const original = await keptIn(slot);
	if (!original) return null;
	const now = await stat(path).catch(() => null);
	if (now && (original.written === undefined || now.mtimeMs === original.written)) return original;
	await rm(slot, { recursive: true, force: true });
	return null;
}

/** when the kept original was taken, or null when none is kept */
export async function originalAt(home: string, path: string): Promise<number | null> {
	return (await currentOriginal(home, path))?.at ?? null;
}

/** puts the kept original back over the file, and lets the copy go */
export async function restoreOriginal(home: string, path: string): Promise<void> {
	const slot = slotOf(home, path);
	if (!(await currentOriginal(home, path))) throw new Error('No original is kept for this image.');
	// in place: cp unlinks first, and a watcher seeing the image deleted closes it
	await copyFile(join(slot, basename(path)), path);
	await rm(slot, { recursive: true, force: true });
}

/** where `path` sits under `dir` ('' for `dir` itself), or null when it is elsewhere */
function under(dir: string, path: string): string | null {
	const fold = process.platform === 'linux' ? (p: string) => p : (p: string) => p.toLowerCase();
	if (fold(path) === fold(dir)) return '';
	const prefix = dir.endsWith(sep) ? dir : dir + sep;
	return fold(path).startsWith(fold(prefix)) ? path.slice(prefix.length) : null;
}

/** a file or folder moved from `from` to `to`: the originals kept for what it holds go with it */
export async function moveOriginals(home: string, from: string, to: string): Promise<void> {
	for (const name of await readdir(home).catch(() => [] as string[])) {
		const slot = join(home, name);
		const original = await keptIn(slot);
		const rest = original ? under(from, original.path) : null;
		if (!original || rest === null) continue;
		const path = rest ? join(to, rest) : to;
		const next = slotOf(home, path);
		if (next !== slot) {
			await rm(next, { recursive: true, force: true });
			await rename(slot, next);
		}
		await rename(join(next, basename(original.path)), join(next, basename(path)));
		await writeFile(join(next, 'original.json'), JSON.stringify({ ...original, path }));
	}
}
