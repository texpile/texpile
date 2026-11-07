import index from './data/index.json';
import { packageSpecOf } from './packageSpec';
import { scanPackage } from './scan/scanPackage';
import type { PackageFileReader } from './scan/moduleScope';
import type { TypstPackageFile } from './types';

const BUNDLED = index as Record<string, string[]>;
const loaders = import.meta.glob<TypstPackageFile>('./data/packages/*/*/*.json', { import: 'default' });
const loaded = new Map<string, TypstPackageFile | null>();
const loading = new Map<string, Promise<TypstPackageFile | null>>();
const SPEC_IN_SOURCE = /"(@[\w-]+\/[\w-]+:\d+\.\d+\.\d+)"/g;

export type PackageCacheReader = (spec: string) => Promise<Record<string, string> | null>;

export function isBundledPackage(spec: string): boolean {
	const parsed = packageSpecOf(spec);
	return !!parsed && (BUNDLED[`@${parsed.namespace}/${parsed.name}`] ?? []).includes(parsed.version);
}

export function loadedPackage(spec: string): TypstPackageFile | null | undefined {
	return loaded.get(spec);
}

function bundledLoader(spec: string): (() => Promise<TypstPackageFile>) | null {
	const parsed = packageSpecOf(spec);
	return parsed && isBundledPackage(spec)
		? (loaders[`./data/packages/${parsed.namespace}/${parsed.name}/${parsed.version}.json`] ?? null)
		: null;
}

function importedSpecs(files: Record<string, string>): Set<string> {
	return new Set([...Object.values(files).join('\n').matchAll(SPEC_IN_SOURCE)].map((m) => m[1]));
}

function readerOf(files: Record<string, string>): PackageFileReader {
	return (path) => (Object.hasOwn(files, path) ? files[path] : null);
}

async function fetched(spec: string, cache: PackageCacheReader | null): Promise<TypstPackageFile | null> {
	const bundled = bundledLoader(spec);
	if (bundled) return bundled().catch(() => null);
	const files = cache ? await cache(spec).catch(() => null) : null;
	if (!files) return null;
	for (const other of importedSpecs(files)) if (other !== spec) await loadPackage(other, cache);
	return scanPackage(spec, readerOf(files), (other) => loaded.get(other) ?? null);
}

export function loadPackage(spec: string, cache: PackageCacheReader | null): Promise<TypstPackageFile | null> {
	if (loaded.has(spec)) return Promise.resolve(loaded.get(spec)!);
	let pending = loading.get(spec);
	if (!pending) {
		pending = fetched(spec, cache).then(async (file) => {
			loaded.set(spec, file);
			loading.delete(spec);
			const others = new Set([...Object.keys(file?.reexports ?? {}), ...Object.values(file?.names ?? {}).flatMap((e) => e.from ?? [])]);
			for (const other of others) await loadPackage(other, cache);
			return file;
		});
		loading.set(spec, pending);
	}
	return pending;
}
