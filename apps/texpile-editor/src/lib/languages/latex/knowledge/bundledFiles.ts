// the package files Texpile ships, loaded when first asked for
import kernel from './data/kernel/latex.json';
import article from './data/classes/article.json';
import type { PackageFile } from './types';

/** the kernel, then article, which a parse reads without waiting */
export const KERNEL_FILES = [kernel, article] as PackageFile[];

const modules = import.meta.glob<{ default: PackageFile }>(['./data/**/*.json', '!./data/texpile/**', '!./data/keyed.json']);
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
