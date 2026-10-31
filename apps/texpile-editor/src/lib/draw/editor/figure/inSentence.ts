import { getLocale } from '$lib/paraglide/runtime';

export function inSentence(text: string) {
	return getLocale() === 'de' ? text : text.toLowerCase();
}
