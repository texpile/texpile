// one original per image, kept apart from Local History so photos never push a paper's text history out
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** `written`: the file's mtime when the app last knew it; a file changed since is a new image with no original here */
type KeptOriginal = { path: string; at: number; size: number; written: number };

const fold = process.platform === 'linux' ? (p: string) => p : (p: string) => p.toLowerCase();

function slotOf(home: string, path: string): string {
	return join(home, createHash('sha1').update(fold(path)).digest('hex'));
}

// in two steps: a crash in the middle leaves the last record, never half of one
async function writeKept(slot: string, original: KeptOriginal): Promise<void> {
	const record = join(slot, 'original.json');
	await writeFile(`${record}.tmp`, JSON.stringify(original));
	await rename(`${record}.tmp`, record);
}

async function keptIn(slot: string): Promise<KeptOriginal | null> {
	try {
		return JSON.parse(await readFile(join(slot, 'original.json'), 'utf8')) as KeptOriginal;
	} catch {
		return null;
	}
}

/** `newest` stays whatever its size: it is the only copy of the image about to be overwritten */
async function prune(home: string, now: number, newest: string): Promise<void> {
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
		if (k.slot === newest) continue;
		total -= k.size;
		await rm(k.slot, { recursive: true, force: true });
	}
}

export async function keepOriginal(home: string, path: string, now = Date.now()): Promise<void> {
	const slot = slotOf(home, path);
	if (await currentOriginal(home, path)) return;
	const { size, mtimeMs } = await stat(path);
	await mkdir(slot, { recursive: true });
	await cp(path, join(slot, basename(path)));
	await writeKept(slot, { path, at: now, size, written: mtimeMs });
	await prune(home, now, slot);
}

export async function noteWritten(home: string, path: string): Promise<void> {
	const slot = slotOf(home, path);
	const original = await keptIn(slot);
	if (!original) return;
	const { mtimeMs } = await stat(path);
	await writeKept(slot, { ...original, written: mtimeMs });
}

async function currentOriginal(home: string, path: string): Promise<KeptOriginal | null> {
	const slot = slotOf(home, path);
	const original = await keptIn(slot);
	if (!original) return null;
	const now = await stat(path).catch(() => null);
	if (now?.mtimeMs === original.written) return original;
	await rm(slot, { recursive: true, force: true });
	return null;
}

export async function originalAt(home: string, path: string): Promise<number | null> {
	return (await currentOriginal(home, path))?.at ?? null;
}

export async function restoreOriginal(home: string, path: string): Promise<void> {
	const slot = slotOf(home, path);
	if (!(await currentOriginal(home, path))) throw new Error('No original is kept for this image.');
	// in place: cp unlinks first, and a watcher seeing the image deleted closes it
	await copyFile(join(slot, basename(path)), path);
	await rm(slot, { recursive: true, force: true });
}

function under(dir: string, path: string): string | null {
	if (fold(path) === fold(dir)) return '';
	const prefix = dir.endsWith(sep) ? dir : dir + sep;
	return fold(path).startsWith(fold(prefix)) ? path.slice(prefix.length) : null;
}

async function moveKept(home: string, slot: string, original: KeptOriginal, path: string): Promise<void> {
	const next = slotOf(home, path);
	if (next !== slot) {
		await rm(next, { recursive: true, force: true });
		await rename(slot, next);
	}
	await rename(join(next, basename(original.path)), join(next, basename(path)));
	await writeKept(next, { ...original, path });
}

export async function moveOriginals(home: string, from: string, to: string): Promise<void> {
	for (const name of await readdir(home).catch(() => [] as string[])) {
		const slot = join(home, name);
		const original = await keptIn(slot);
		const rest = original ? under(from, original.path) : null;
		if (!original || rest === null) continue;
		const path = rest ? join(to, rest) : to;
		// one that cannot move stays behind, and the rest still go
		await moveKept(home, slot, original, path).catch(() => {});
	}
}
