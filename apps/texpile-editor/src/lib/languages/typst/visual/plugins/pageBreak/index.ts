import { dividerFace, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';
import { readBreak } from './breakCall';
import TypstBreakSettings from './TypstBreakSettings.svelte';
import { pageBreakDocument } from './document';
import { pageBreakInserts } from './pageBreakInsert';

export const pageBreak: TypstPlugin = {
	functions: ['pagebreak', 'colbreak'],
	face(core) {
		const breaking = readBreak(core.source);
		if (!breaking) return null;
		return dividerFace(breaking.kind === 'column' ? m.drawn_chip_typst_column_break() : m.drawn_chip_page_label(), core.source);
	},
	settings: (source) => (readBreak(source) ? TypstBreakSettings : null),
	document: pageBreakDocument,
	insert: pageBreakInserts
};
