// Typst's own library, as the compiler declares it (package-scan/typst in texpile-tools)
import std from './data/std.json';
import type { TypstEntry, TypstPackageFile } from './types';

export const STD_LIBRARY = std as unknown as TypstPackageFile & { typst: string };

export const STD_MODULE: TypstEntry = { kind: 'module', scope: STD_LIBRARY.names };

export function stdEntry(path: string): TypstEntry | null {
	let entry: TypstEntry | undefined = STD_MODULE;
	for (const part of path.split('.')) entry = entry?.scope && Object.hasOwn(entry.scope, part) ? entry.scope[part] : undefined;
	return entry ?? null;
}
