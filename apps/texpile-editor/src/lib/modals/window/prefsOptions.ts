// The option lists Preferences' selects render, and the locale switch.
import { applyUiLocale, updateSettings, type AppSettings } from '$lib/settings';
import { LOCALE_META } from '$lib/localeMeta';
import { markPreferencesReopen } from '$lib/stores/dialogStore';
import { m } from '$lib/paraglide/messages';
import { ENGLISH_VARIANTS, systemVariant, type EnglishVariant } from '$lib/editor/spellcheck/config/grammarRules';
import { SPELL_LANGUAGES, type SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { spellLanguageName } from '$lib/editor/spellcheck/languages/spellingLanguage.svelte';

// source-editor keybindings; Vim and Emacs are names, so they are not translated
export function keymapOptions(): { value: AppSettings['editorKeymap']; label: string }[] {
	return [
		{ value: 'default', label: m.prefs_keybindings_default() },
		{ value: 'vim', label: 'Vim' },
		{ value: 'emacs', label: 'Emacs' }
	];
}

export function uiLocaleOptions(): { value: AppSettings['uiLocale']; label: string }[] {
	return (Object.entries(LOCALE_META) as [AppSettings['uiLocale'], (typeof LOCALE_META)[AppSettings['uiLocale']]][]).map(
		([value, meta]) => ({ value, label: meta.label })
	);
}

export function changeUiLocale(e: Event): void {
	const uiLocale = (e.currentTarget as HTMLSelectElement).value as AppSettings['uiLocale'];
	updateSettings({ uiLocale });
	markPreferencesReopen();
	applyUiLocale(uiLocale);
}

/** the Englishes spelling can follow, the system's own first */
export function englishVariantOptions(): { value: AppSettings['englishVariant']; label: string }[] {
	const names: Record<EnglishVariant, string> = {
		american: m.prefs_english_american(),
		british: m.prefs_english_british(),
		australian: m.prefs_english_australian(),
		canadian: m.prefs_english_canadian(),
		indian: m.prefs_english_indian()
	};
	return [
		{ value: '', label: m.prefs_english_system({ variant: names[systemVariant(navigator.languages)] }) },
		...ENGLISH_VARIANTS.map((v) => ({ value: v, label: names[v] }))
	];
}

/** the languages spelling can be checked in, each named in the reading language */
export function spellLanguageOptions(): { value: SpellLanguage; label: string }[] {
	return SPELL_LANGUAGES.map((value) => ({ value, label: spellLanguageName(value) }));
}
