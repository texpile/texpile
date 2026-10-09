// the folder's spelling language, chosen from Spelling > Folder Language or Preferences: Automatic, which says what it
// picked and from where, then every language
import { m } from '$lib/paraglide/messages';
import { box } from '$lib/runes/box.svelte';
import { projectConfigSync, projectSpelling } from '$lib/workspace/projectConfigSync.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { declaredLanguageName, spellLanguageName, type SpellingChoice } from './spellingLanguage.svelte';
import { isSpellLanguage, SPELL_LANGUAGES } from './spellLanguages';

export type FolderLanguageItem = { value: string; label: string; checked: boolean };

export const AUTOMATIC = 'auto';

/** the open document's choice, for Preferences, which has no document of its own; null with no folder open */
export const openSpelling = box<{ choice: SpellingChoice; fixed: boolean } | null>(null);

function automaticLabel(choice: SpellingChoice | null): string {
	if (choice?.named && choice.automatic) return m.spelling_automatic_from_document({ language: spellLanguageName(choice.automatic) });
	if (choice?.named) return m.spelling_automatic_unchecked({ language: declaredLanguageName(choice.named) });
	if (choice?.automatic) return m.spelling_automatic_default({ language: spellLanguageName(choice.automatic) });
	return m.spelling_automatic();
}

export function folderLanguageItems(choice: SpellingChoice | null): FolderLanguageItem[] {
	const folder = projectSpelling.current;
	return [
		{ value: AUTOMATIC, label: automaticLabel(choice), checked: !folder },
		...SPELL_LANGUAGES.map((language) => ({ value: language, label: spellLanguageName(language), checked: folder === language }))
	];
}

export function chooseFolderLanguage(value: string): void {
	projectConfigSync.setSpelling(workspaceRoot.current, isSpellLanguage(value) ? value : null);
}
