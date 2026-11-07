import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { pictureFace } from './pictureFace';
import { pictureDocument } from './document';

export const picture: TypstPlugin = {
	role: (use) => use.form === 'call' && use.origin === 'package' && !!use.entry?.picture,
	face: ({ source }) => pictureFace(source),
	document: pictureDocument
};
