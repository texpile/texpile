// The original of each image the image tab overwrites: one copy per file, the one before its first edit, kept apart
// from Local History so photos never push a paper's text history out
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

type KeptOriginal = { path: string; at: number; size: number };

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

/** when the kept original was taken, or null when none is kept */
export async function originalAt(home: string, path: string): Promise<number | null> {
	return (await keptIn(slotOf(home, path)))?.at ?? null;
}

/** puts the kept original back over the file, and lets the copy go */
export async function restoreOriginal(home: string, path: string): Promise<void> {
	const slot = slotOf(home, path);
	if (!(await keptIn(slot))) throw new Error('No original is kept for this image.');
	await cp(join(slot, basename(path)), path);
	await rm(slot, { recursive: true, force: true });
}
