import { loremText, readLorem, tippedFace, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';
import TypstLoremSettings from './TypstLoremSettings.svelte';
import { loremDocument } from './document';

export const lorem: TypstPlugin = {
	functions: ['lorem'],
	face({ source }) {
		const read = readLorem(source);
		if (!read) return null;
		const dom = document.createElement('span');
		dom.style.color = 'var(--muted-text)';
		dom.textContent = loremText(read.words);
		return tippedFace(dom, m.drawn_chip_typst_lorem_hint({ words: String(read.words) }));
	},
	settings: (source) => (readLorem(source) ? TypstLoremSettings : null),
	document: loremDocument
};
