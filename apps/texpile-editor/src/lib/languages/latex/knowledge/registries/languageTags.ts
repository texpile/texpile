import { commonRegistry, type CommonRegistryItem } from './registries';
import { useNameOf } from '../fileIds';

type LanguageItem = CommonRegistryItem<'languages'>;

const BABEL_FILE = 'packages/babel';

type LanguageIndex = {
	/** babel names, then babel aliases, lowercase */
	babel: Map<string, string[]>;
	polyglossia: Map<string, LanguageItem>;
};

let index: LanguageIndex | null = null;

function languageIndex(): LanguageIndex {
	if (index) return index;
	const names = new Map<string, string[]>();
	const aliases = new Map<string, string[]>();
	const polyglossia = new Map<string, LanguageItem>();
	function add(into: Map<string, string[]>, key: string, tag: string) {
		into.set(key, [...(into.get(key) ?? []), tag]);
	}
	for (const item of commonRegistry('languages')) {
		if (item.file === 'packages/polyglossia') polyglossia.set(item.name.toLowerCase(), item);
		else if (item.file === BABEL_FILE) {
			add(names, item.name.toLowerCase(), item.bcp47 ?? '');
			for (const alias of item.aliases ?? []) add(aliases, alias.toLowerCase(), item.bcp47 ?? '');
		}
	}
	const babel = new Map<string, string[]>();
	for (const key of new Set([...names.keys(), ...aliases.keys()])) {
		babel.set(key, [...(names.get(key) ?? []), ...(aliases.get(key) ?? [])].filter(Boolean));
	}
	index = { babel, polyglossia };
	return index;
}

/** whether a package use takes its languages as options */
export function isBabelPackage(useName: string): boolean {
	return useName === useNameOf(BABEL_FILE);
}

/** a name babel loads or aliases (ngerman, USenglish), lowercase */
export function isBabelLanguageName(name: string): boolean {
	return languageIndex().babel.has(name);
}

/** the BCP 47 tags babel and polyglossia give a name, a polyglossia variant first; [] when neither knows it */
export function languageTagsOf(name: string, variant?: string): string[] {
	const { babel, polyglossia } = languageIndex();
	const poly = polyglossia.get(name);
	const ofVariant = variant ? poly?.variants?.find((v) => v.name.toLowerCase() === variant)?.bcp47 : undefined;
	return [...new Set([ofVariant, ...(babel.get(name) ?? []), poly?.bcp47].filter((tag): tag is string => !!tag))];
}
