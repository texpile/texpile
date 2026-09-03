// The option lists Preferences' selects render, and the locale switch with its
// machine-translation warning.
import { applyUiLocale, updateSettings, type AppSettings } from '$lib/settings';
import { LOCALE_META } from '$lib/localeMeta';
import { toaster } from '$lib/modals/toaster-svelte';
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

// <option> only renders plain text, so the machine-translated tag is appended into the label itself
export function uiLocaleOptions(): { value: AppSettings['uiLocale']; label: string }[] {
	return (Object.entries(LOCALE_META) as [AppSettings['uiLocale'], (typeof LOCALE_META)[AppSettings['uiLocale']]][]).map(
		([value, meta]) => ({
			value,
			label: meta.machineTranslated ? `${meta.label} ${m.prefs_machine_translated_tag({}, { locale: value })}` : meta.label
		})
	);
}

export function changeUiLocale(e: Event): void {
	const uiLocale = (e.currentTarget as HTMLSelectElement).value as AppSettings['uiLocale'];
	updateSettings({ uiLocale });
	if (!LOCALE_META[uiLocale]?.machineTranslated) {
		applyUiLocale(uiLocale);
		return;
	}
	// warn every time (not just once) since switching to this language is a deliberate, infrequent action
	toaster.warning({
		title: m.mt_warning_title(),
		description: m.mt_warning_description(),
		duration: 6000,
		action: {
			label: m.mt_warning_report_action(),
			onClick: () => {
				const title = `Translation issue: ${LOCALE_META[uiLocale]?.label ?? uiLocale}`;
				window.open(`https://github.com/texpile/texpile/issues/new?title=${encodeURIComponent(title)}`, '_blank', 'noopener,noreferrer');
			}
		}
	});
	// give the toast a moment on screen before the locale-switch reload would otherwise wipe it
	setTimeout(() => applyUiLocale(uiLocale), 3000);
}
