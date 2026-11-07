import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { readImage } from './imageCall';
import { imageDocument } from './document';

export const image: TypstPlugin = {
	role: (use) => use.form === 'call' && use.origin === 'std' && use.entry?.group === 'visualize',
	face({ source, drawImage }) {
		const read = readImage(source);
		return read && drawImage(read);
	},
	document: imageDocument
};
