// Typst's own library, as the compiler declares it (package-scan/typst in texpile-tools)
import std from './data/std.json';
import type { TypstEntry, TypstPackageFile } from './types';

export const STD_LIBRARY = std as unknown as TypstPackageFile & { typst: string };

/** Typst's library as one module, its names in `scope` */
export const STD_MODULE: TypstEntry = { kind: 'module', scope: STD_LIBRARY.names };

/** a name of Typst's own, or a path into one (`table.cell`, `math.equation`, `calc.abs`) */
export function stdEntry(path: string): TypstEntry | null {
	let entry: TypstEntry | undefined = STD_MODULE;
	for (const part of path.split('.')) entry = entry?.scope && Object.hasOwn(entry.scope, part) ? entry.scope[part] : undefined;
	return entry ?? null;
}
