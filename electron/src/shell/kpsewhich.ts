// where the TeX installation keeps a file, by name; async, a spawn takes 50 to 200 ms
import { execFile } from 'node:child_process';
import { shellEnvReady } from './shellEnv';
import { onToolPathChange } from './toolDirs';

const cache = new Map<string, Promise<string | null>>();
// the folders in Preferences can reach another TeX, or a first one
onToolPathChange(() => cache.clear());

export function kpsewhich(file: string): Promise<string | null> {
	let p = cache.get(file);
	if (!p) {
		const lookup = shellEnvReady().then(
			() =>
				new Promise<string | null>((resolve) => {
					execFile('kpsewhich', [file], { timeout: 15000, windowsHide: true }, (err, stdout) => {
						// asked again only when it could not start: a real miss is asked for on every draft patch
						if (typeof (err as NodeJS.ErrnoException | null)?.code === 'string' && cache.get(file) === lookup) cache.delete(file);
						resolve(err ? null : stdout.toString().trim().replace(/\\/g, '/') || null);
					});
				})
		);
		p = lookup;
		cache.set(file, p);
	}
	return p;
}
