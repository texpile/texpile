import { horizontalSpaceFace, verticalSpaceFace, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { readSpacing } from './spacingCall';
import TypstSpacingSettings from './TypstSpacingSettings.svelte';
import { spacingDocument } from './document';
import { spacingInserts } from './spacingInsert';

export const spacing: TypstPlugin = {
	functions: ['v', 'h'],
	face({ source }) {
		const space = readSpacing(source);
		if (space?.vertical) return verticalSpaceFace('#v', space.length, space.amount.replace(/\s+/g, ' ').trim(), source);
		return space ? horizontalSpaceFace(space.length, source, true) : null;
	},
	// a space by some other amount (a variable, a calculation) is drawn, and edited as its Typst
	settings: (source) => (readSpacing(source)?.length ? TypstSpacingSettings : null),
	document: spacingDocument,
	insert: spacingInserts
};
