// The option lists Preferences' selects render, and the locale switch.
import { applyUiLocale, updateSettings, type AppSettings } from '$lib/settings';
import { LOCALE_META } from '$lib/localeMeta';
import { m } from '$lib/paraglide/messages';

// source-editor keybindings; Vim and Emacs are names, so they are not translated
export function keymapOptions(): { value: AppSettings['editorKeymap']; label: string }[] {
	return [
		{ value: 'default', label: m.prefs_keybindings_default() },
		{ value: 'vim', label: 'Vim' },
		{ value: 'emacs', label: 'Emacs' }
	];
}

// image resize snaps to multiples of this fraction of \textwidth
export function resizeStepOptions(): { value: number; label: string }[] {
	return [
		{ value: 0.1, label: '10%' },
		{ value: 0.25, label: '25%' },
		{ value: 0.5, label: '50%' }
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
	applyUiLocale(uiLocale);
}
