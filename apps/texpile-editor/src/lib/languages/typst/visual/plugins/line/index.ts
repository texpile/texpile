import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { lineFace } from './lineFace';
import { lineDocument } from './document';

export const line: TypstPlugin = {
	role(use) {
		const params = use.entry?.params?.map((param) => param.name) ?? [];
		return (
			use.form === 'call' &&
			use.origin === 'std' &&
			use.entry?.group === 'visualize' &&
			params.includes('length') &&
			params.includes('angle')
		);
	},
	face: ({ source }) => lineFace(source),
	document: lineDocument
};
