// the package files Texpile ships, loaded when first asked for
import ids from 'virtual:bundled-package-ids';
import baseTable from './data/base-table.json';
import type { Argument, PackageFile } from './types';
import type { EnvFacts } from './environments/envFacts';

/** the arguments the kernel and texpile/ctan-base's files give, stacked, for a parse that cannot wait for files */
export const BASE_TABLE = baseTable as {
	macros: Record<string, Argument[]>;
	envs: Record<string, Argument[]>;
	math: string[];
	bodies: Record<string, EnvFacts>;
};

const IDS = new Set(ids);
const cache = new Map<string, Promise<PackageFile | null>>();

export function isBundled(id: string): boolean {
	return IDS.has(id);
}

export function bundledIds(): string[] {
	return ids;
}

export function loadBundled(id: string): Promise<PackageFile | null> {
	let file = cache.get(id);
	if (!file) {
		// at assets/data/ beside the built chunk (scripts/packageData.ts); not a template literal, which Vite turns into a glob
		file = IDS.has(id)
			? fetch(new URL('./data/' + id + '.json', import.meta.url))
					.then((r) => (r.ok ? (r.json() as Promise<PackageFile>) : null))
					.catch(() => null)
			: Promise.resolve(null);
		cache.set(id, file);
	}
	return file;
}
