// what is known about each package and class as a CTAN package: its caption, page, whether it is everyday, and where
// completion suggests it before a document loads it
import catalog from './data/texpile/catalog.json';
import { useNameOf } from './fileIds';

export type CatalogEntry = { about?: string; url?: string; common?: boolean; suggested?: number };

const ENTRIES = catalog.entries as Record<string, CatalogEntry>;

/** the packages completion offers before a document loads them, most loaded first */
export const SUGGESTED_PACKAGES: string[] = Object.entries(ENTRIES)
	.filter(([, e]) => e.suggested)
	.sort(([, a], [, b]) => (a.suggested ?? 0) - (b.suggested ?? 0))
	.map(([id]) => useNameOf(id));

/** the packages and classes the suggestions' `clashes` were measured against, by use name */
export const CLASH_PROBED: ReadonlySet<string> = new Set(((catalog as { clashProbed?: string[] }).clashProbed ?? []).map(useNameOf));

export function catalogEntry(id: string): CatalogEntry | undefined {
	return ENTRIES[id];
}

/** every catalog id under a folder (`packages`, `classes`) */
export function catalogIds(folder: string): string[] {
	return Object.keys(ENTRIES).filter((id) => id.startsWith(`${folder}/`));
}
