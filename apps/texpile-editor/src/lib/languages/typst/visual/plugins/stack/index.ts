import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { stackFace } from './stackFace';
import { stackDocument } from './document';

export const stack: TypstPlugin = {
	role(use) {
		const names = use.entry?.params?.map((param) => param.name) ?? [];
		return use.form === 'call' && use.origin === 'std' && names.includes('dir') && names.includes('children');
	},
	face: (core) => stackFace(core.source, core),
	document: stackDocument
};
