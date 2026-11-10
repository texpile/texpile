import { observe } from '$lib/runes/observe.svelte';
import { settings } from '$lib/settings';
import { textFontValue } from './editorTextFont';

// inline on the root: it outranks every stylesheet, a custom theme's included
export function watchEditorTextFont(): void {
	observe(
		() => settings.current.textFont,
		(family) => {
			const root = document.documentElement.style;
			if (family) root.setProperty('--editor-text-font', textFontValue(family));
			else root.removeProperty('--editor-text-font');
		}
	);
}
