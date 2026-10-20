// the names files provide that are neither commands nor environments: colors, counters, page styles, column types,
// floats, languages, bibliography styles, glossary types, the files a compile writes, the graphics an engine reads
import registriesIndex from '../data/registries.json';
import { conditionHolds, type LoadedFile } from '../loadedFiles';
import type { Registries } from '../types';

export type RegistryName = keyof Registries;
export type RegistryItem<R extends RegistryName> = Registries[R][number];
export type CommonRegistryItem<R extends RegistryName> = RegistryItem<R> & { file: string };

const COMMON = (registriesIndex as unknown as { registries: { [R in RegistryName]?: CommonRegistryItem<R>[] } }).registries;

/** what the files the arXiv sample loads provide, for code that reads a file before its packages are known */
export function commonRegistry<R extends RegistryName>(registry: R): CommonRegistryItem<R>[] {
	return COMMON[registry] ?? [];
}

/** the items whose `if` the options meet; an item under a met `if` replaces the one of its name (cleveref's names under
 * noabbrev) */
export function itemsUnder<T extends object>(items: T[], options: Set<string>): T[] {
	const met = items.filter((i) => !('if' in i) || !i.if || conditionHolds(i.if as string, options));
	const conditioned = new Set(met.flatMap((i) => ('if' in i && i.if && 'name' in i ? [i.name] : [])));
	return met.filter((i) => !('name' in i) || !conditioned.has(i.name) || ('if' in i && i.if));
}

/** what the files a document loads provide, each item under its file's options */
export function loadedRegistry<R extends RegistryName>(files: LoadedFile[], registry: R): RegistryItem<R>[] {
	return files.flatMap((f) =>
		itemsUnder(
			f.layers.flatMap((l) => (l.provides?.[registry] ?? []) as RegistryItem<R>[]),
			f.options
		)
	);
}
