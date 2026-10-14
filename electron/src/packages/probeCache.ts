// probe results kept across launches, each valid while its .sty keeps the same path and modification time
import { app } from 'electron';
import * as fs from 'node:fs';
import { join } from 'node:path';
import type { PackageProbe } from './packageProbe';

type CachedProbe = { sty: string; mtime: number; probe: PackageProbe };

const MAX_ENTRIES = 400;
// raised when a probe's shape changes, so older results are asked again
const VERSION = 4;

let entries: Map<string, CachedProbe> | null = null;
let writing: NodeJS.Timeout | null = null;

function cachePath(): string {
	return join(app.getPath('userData'), 'package-probes.json');
}

function load(): Map<string, CachedProbe> {
	if (entries) return entries;
	entries = new Map();
	try {
		const saved = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as { v: number; entries: [string, CachedProbe][] };
		if (saved.v === VERSION) entries = new Map(saved.entries);
	} catch {
		/* none yet, or unreadable: probed again */
	}
	return entries;
}

function save(): void {
	if (writing) return;
	writing = setTimeout(() => {
		writing = null;
		const all = [...load()].slice(-MAX_ENTRIES);
		void fs.promises.writeFile(cachePath(), JSON.stringify({ v: VERSION, entries: all })).catch(() => {});
	}, 1000);
}

export function cachedProbe(key: string, sty: string, mtime: number): PackageProbe | null {
	const hit = load().get(key);
	return hit && hit.sty === sty && hit.mtime === mtime ? hit.probe : null;
}

export function storeProbe(key: string, sty: string, mtime: number, probe: PackageProbe): void {
	const all = load();
	all.delete(key);
	all.set(key, { sty, mtime, probe });
	save();
}
