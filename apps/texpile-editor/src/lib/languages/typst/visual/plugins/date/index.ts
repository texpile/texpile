import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { dateFace } from './dateFace';
import { dateDocument } from './document';

export const date: TypstPlugin = {
	role: (use) => use.form === 'call' && use.name.endsWith(').display'),
	face: ({ source }) => dateFace(source),
	document: dateDocument
};
