// which language a file's spelling is checked in: the folder's choice, else what the file names, else what its main
// file names, else the preference
import { box } from '$lib/runes/box.svelte';
import { settings } from '$lib/settings';
import { mainFile } from '$lib/workspace/workspaceStore';
import { projectSpelling } from '$lib/workspace/projectConfigSync.svelte';
import { declaredLanguage, declaredLanguageTags, type DeclaredLanguage } from '$lib/editor/declaredLanguage';
import { getLocale } from '$lib/paraglide/runtime';
import { isSpellLanguage, type SpellLanguage } from './spellLanguages';

/** what the main file names, for the files it pulls in, which name nothing themselves */
export const mainFileLanguage = box<DeclaredLanguage | undefined>(undefined);

export type SpellingChoice = {
	/** null: the document is in a language with no dictionary here, so nothing is checked */
	language: SpellLanguage | null;
	/** what Automatic picks, the folder's choice aside */
	automatic: SpellLanguage | null;
	/** the declaration Automatic followed, if any */
	named?: DeclaredLanguage;
};

/** null for a language without a dictionary here */
export function spellLanguageOf(named: DeclaredLanguage): SpellLanguage | null {
	for (const tag of declaredLanguageTags(named)) {
		const [language, ...rest] = tag.split('-');
		const region = rest.find((part) => part.length === 2)?.toUpperCase();
		if (language === 'pt') return region === 'BR' ? 'pt-BR' : 'pt-PT';
		if (isSpellLanguage(language)) return language;
	}
	return null;
}

let mainRead = 0;

/** an unreadable main file names nothing */
export async function refreshMainFileLanguage(main: string | null, read: (path: string) => Promise<string>): Promise<void> {
	const token = ++mainRead;
	const named = main ? await read(main).then(declaredLanguage, () => undefined) : undefined;
	if (token === mainRead && JSON.stringify(named) !== JSON.stringify(mainFileLanguage.current)) mainFileLanguage.current = named;
}

function extensionOf(path: string): string | undefined {
	return /\.[^./\\]+$/.exec(path)?.[0].toLowerCase();
}

/** the main file's language reaches the files of its own kind: a .tex main names nothing for a README.md */
function mainLanguageFor(path: string | null): DeclaredLanguage | undefined {
	const main = mainFile.current;
	return path && main && extensionOf(path) === extensionOf(main) ? mainFileLanguage.current : undefined;
}

export function spellingFor(path: string | null, source: string): SpellingChoice {
	const named = declaredLanguage(source) ?? mainLanguageFor(path);
	const automatic = named ? spellLanguageOf(named) : settings.current.spellLanguage;
	return { language: projectSpelling.current ?? automatic, automatic, named };
}

/** in the reading language: German, Deutsch */
export function spellLanguageName(language: SpellLanguage): string {
	return new Intl.DisplayNames([getLocale()], { type: 'language' }).of(language) ?? language;
}

/** a declared language without a dictionary, named as well as it can be */
export function declaredLanguageName(named: DeclaredLanguage): string {
	if (/^[a-z]{2,3}(-|$)/.test(named.name)) {
		try {
			return new Intl.DisplayNames([getLocale()], { type: 'language' }).of(named.name) ?? named.name;
		} catch {
			return named.name;
		}
	}
	return named.name[0].toUpperCase() + named.name.slice(1);
}
