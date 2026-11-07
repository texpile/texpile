import { textNow } from '$lib/buffers/textNow';
import { joinPath, relativeInside } from '$lib/workspace/fileSystem';
import type { PackageCacheReader } from '../../../knowledge';
import type { ProjectFiles } from './projectScope';

export async function typstPackageCache(spec: string): ReturnType<PackageCacheReader> {
	return typeof window === 'undefined' ? null : ((await window.texpileTypst?.packageFiles?.(spec)) ?? null);
}

export function typstProjectOf(root: string | null, file: string, main: string | null = null): ProjectFiles | undefined {
	const path = root ? relativeInside(root, file) : null;
	if (!root || path === null) return undefined;
	const mainPath = main && /\.typ$/i.test(main) ? relativeInside(root, main) : null;
	return { path, main: mainPath, read: (rel) => textNow(joinPath(root, rel)).catch(() => null) };
}
