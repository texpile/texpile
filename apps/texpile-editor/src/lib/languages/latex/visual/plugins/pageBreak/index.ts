import { dividerFace, PAGE_BREAKS, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { readPageBreak } from './pageBreakCommand';
import PageBreakSettings from './PageBreakSettings.svelte';
import { pageBreakDocument } from './document';
import { pageBreakInserts } from './pageBreakInsert';
import { m } from '$lib/paraglide/messages';

export const pageBreak: LatexPlugin = {
	commands: [...PAGE_BREAKS],
	face: (part, core) => (part.kind === 'command' ? dividerFace(m.drawn_chip_page_label(), core.source) : undefined),
	settings: (source) => (readPageBreak(source) ? PageBreakSettings : null),
	document: pageBreakDocument,
	insert: pageBreakInserts
};
