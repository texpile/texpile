import { dividerFace, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { readOutline } from './outlineCall';
import { outlineLabel } from './outlineLabel';
import TypstOutlineSettings from './TypstOutlineSettings.svelte';
import { outlineDocument } from './document';
import { outlineInserts } from './outlineInsert';

export const outline: TypstPlugin = {
	functions: ['outline'],
	face({ source }) {
		const read = readOutline(source);
		return read ? dividerFace(outlineLabel(read), source) : null;
	},
	settings: (source) => (readOutline(source) ? TypstOutlineSettings : null),
	document: outlineDocument,
	insert: outlineInserts
};
