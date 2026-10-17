// what is known about each package and class as a CTAN package: its caption, page and whether it is everyday
import catalog from './data/texpile/catalog.json';

export type CatalogEntry = { about?: string; url?: string; common?: boolean };

const ENTRIES = catalog.entries as Record<string, CatalogEntry>;

export function catalogEntry(id: string): CatalogEntry | undefined {
	return ENTRIES[id];
}

/** every catalog id under a folder (`packages`, `classes`) */
export function catalogIds(folder: string): string[] {
	return Object.keys(ENTRIES).filter((id) => id.startsWith(`${folder}/`));
}
