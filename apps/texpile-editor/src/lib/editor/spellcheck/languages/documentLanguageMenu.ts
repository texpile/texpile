// Spelling > Document Language: Automatic, which says what it picked, then every language. The choice is the folder's
import { m } from '$lib/paraglide/messages';
import { projectConfigSync, projectSpelling } from '$lib/workspace/projectConfigSync.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { declaredLanguageName, spellLanguageName, type SpellingChoice } from './spellingLanguage.svelte';
import { isSpellLanguage, SPELL_LANGUAGES } from './spellLanguages';

export type DocumentLanguageItem = { value: string; label: string; checked: boolean };

export const AUTOMATIC = 'auto';

function automaticLabel(choice: SpellingChoice | null): string {
	if (choice?.automatic) return m.spelling_automatic_named({ language: spellLanguageName(choice.automatic) });
	if (choice?.named) return m.spelling_automatic_unchecked({ language: declaredLanguageName(choice.named) });
	return m.spelling_automatic();
}

export function documentLanguageItems(choice: SpellingChoice | null): DocumentLanguageItem[] {
	const folder = projectSpelling.current;
	return [
		{ value: AUTOMATIC, label: automaticLabel(choice), checked: !folder },
		...SPELL_LANGUAGES.map((language) => ({ value: language, label: spellLanguageName(language), checked: folder === language }))
	];
}

export function chooseDocumentLanguage(value: string): void {
	projectConfigSync.setSpelling(workspaceRoot.current, isSpellLanguage(value) ? value : null);
}
