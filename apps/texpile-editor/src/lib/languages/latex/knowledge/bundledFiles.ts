// the package files Texpile ships, loaded when first asked for
import baseTable from './data/base-table.json';
import type { Argument, PackageFile } from './types';
import type { EnvFacts } from './envFacts';

/** the arguments the kernel and texpile/ctan-base's files give, stacked, for a parse that cannot wait for files */
export const BASE_TABLE = baseTable as {
	macros: Record<string, Argument[]>;
	envs: Record<string, Argument[]>;
	math: string[];
	bodies: Record<string, EnvFacts>;
};

const modules = import.meta.glob<{ default: PackageFile }>([
	'./data/**/*.json',
	'!./data/texpile/catalog.json',
	'!./data/keyed.json',
	'!./data/base-table.json',
	'!./data/env-facts.json'
]);
const PREFIX = './data/';
const cache = new Map<string, Promise<PackageFile | null>>();

function pathOf(id: string): string {
	return `${PREFIX}${id}.json`;
}

export function isBundled(id: string): boolean {
	return pathOf(id) in modules;
}

export function bundledIds(): string[] {
	return Object.keys(modules).map((path) => path.slice(PREFIX.length, -'.json'.length));
}

export function loadBundled(id: string): Promise<PackageFile | null> {
	let file = cache.get(id);
	if (!file) {
		const loader = modules[pathOf(id)];
		file = loader
			? loader()
					.then((m) => m.default)
					.catch(() => null)
			: Promise.resolve(null);
		cache.set(id, file);
	}
	return file;
}
