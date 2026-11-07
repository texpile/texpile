import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { wraps } from './elementCall';
import { elementFace } from './elementFace';
import { elementDocument } from './document';

export const element: TypstPlugin = {
	role: (use) => use.form === 'call' && use.origin === 'std' && !!use.entry && wraps(use.entry),
	face: (core) => elementFace(core.source, core),
	document: elementDocument
};
