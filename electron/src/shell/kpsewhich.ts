// where the TeX installation keeps a file, by name; async, a spawn takes 50 to 200 ms, so one turn's names share one
import { execFile } from 'node:child_process';
import path from 'node:path';
import { shellEnvReady } from './shellEnv';
import { onToolPathChange } from './toolDirs';

type Lookup = { file: string; found: Promise<string | null>; resolve: (path: string | null) => void };

const cache = new Map<string, Promise<string | null>>();
// the folders in Preferences can reach another TeX, or a first one
onToolPathChange(() => cache.clear());
let batch: Lookup[] | null = null;

function lookUp(lookups: Lookup[]): void {
	execFile(
		'kpsewhich',
		lookups.map((l) => l.file),
		{ timeout: 15000, windowsHide: true },
		(err, stdout) => {
			// asked again only when it could not start: a real miss is asked for on every draft patch
			const unstarted = typeof (err as NodeJS.ErrnoException | null)?.code === 'string';
			// one name missing makes it exit 1, with the others still printed
			const paths = new Map<string, string>();
			for (const line of stdout.toString().split(/\r?\n/)) {
				const found = line.trim().replace(/\\/g, '/');
				if (found) paths.set(path.posix.basename(found).toLowerCase(), found);
			}
			for (const l of lookups) {
				if (unstarted && cache.get(l.file) === l.found) cache.delete(l.file);
				l.resolve(paths.get(l.file.toLowerCase()) ?? null);
			}
		}
	);
}

export function kpsewhich(file: string): Promise<string | null> {
	let p = cache.get(file);
	if (!p) {
		let resolve!: (path: string | null) => void;
		p = new Promise<string | null>((r) => (resolve = r));
		cache.set(file, p);
		if (!batch) {
			const lookups: Lookup[] = (batch = []);
			// each IPC call is its own task, so wait a moment for the rest
			void shellEnvReady().then(() =>
				setTimeout(() => {
					batch = null;
					lookUp(lookups);
				}, 10)
			);
		}
		batch.push({ file, found: p, resolve });
	}
	return p;
}
