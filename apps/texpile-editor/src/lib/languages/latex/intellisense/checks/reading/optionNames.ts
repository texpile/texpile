// the options each loaded file takes, read ahead since the checks run without waiting
import { packageOptions } from '../../../knowledge/keyCompletions';
import type { LoadedFile } from '../../../knowledge/loadedFiles';

/** of: null for a file whose data lists none, a language name counting as an option; all: what any loaded file takes */
export type OptionNames = { of: ReadonlyMap<string, ReadonlySet<string> | null>; all: ReadonlySet<string> };

export const NO_OPTIONS: OptionNames = { of: new Map(), all: new Set() };

const cache = new WeakMap<LoadedFile[], Promise<OptionNames>>();

/** an option's key: the part before the =, with its spaces gone as LaTeX drops them */
export function optionKey(option: string): string {
	return option.split('=')[0].replace(/\s+/g, '');
}

export function optionNamesOf(loaded: LoadedFile[]): Promise<OptionNames> {
	let names = cache.get(loaded);
	if (!names) {
		names = Promise.all(
			loaded.map(async (f) => {
				const options = await packageOptions([f.name]);
				const languages = f.layers
					.flatMap((l) => l.provides?.languages ?? [])
					.flatMap((l) => [l.name, ...(l.aliases ?? []), ...(l.variants ?? []).map((v) => v.name)]);
				const keys = [...(options?.map((o) => optionKey(o.label)) ?? []), ...languages];
				return [f.name, options || languages.length ? new Set(keys) : null] as const;
			})
		).then((entries) => ({ of: new Map(entries), all: new Set(entries.flatMap(([, keys]) => (keys ? [...keys] : []))) }));
		cache.set(loaded, names);
	}
	return names;
}
