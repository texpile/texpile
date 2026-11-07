import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { glossaryFace } from './glossaryFace';

export const glossary: TypstPlugin = {
	role: (use) => use.form === 'call' && use.origin === 'package' && !!use.entry?.glossary,
	face: ({ source }) => glossaryFace(source)
};
