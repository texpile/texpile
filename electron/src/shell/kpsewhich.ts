// where the TeX installation keeps a file, by name; async, a spawn takes 50 to 200 ms
import { execFile } from 'node:child_process';
import { shellEnvReady } from './shellEnv';

const cache = new Map<string, Promise<string | null>>();

export function kpsewhich(file: string): Promise<string | null> {
	let p = cache.get(file);
	if (!p) {
		p = shellEnvReady().then(
			() =>
				new Promise<string | null>((resolve) => {
					execFile('kpsewhich', [file], { timeout: 15000, windowsHide: true }, (err, stdout) => {
						resolve(err ? null : stdout.toString().trim().replace(/\\/g, '/') || null);
					});
				})
		);
		cache.set(file, p);
	}
	return p;
}
