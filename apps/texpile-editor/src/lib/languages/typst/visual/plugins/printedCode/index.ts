import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { printedFace } from './printedFace';
import { printedCodeDocument } from './document';

export const printedCode: TypstPlugin = {
	role: (use) => use.form === 'call' && use.origin === 'std' && !!use.entry?.mono,
	face: ({ source }) => printedFace(source),
	document: printedCodeDocument
};
