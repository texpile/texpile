import { dividerFace, PAGE_BREAKS, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { readPageBreak } from './pageBreakCommand';
import PageBreakSettings from './PageBreakSettings.svelte';
import { pageBreakDocument } from './document';

export const pageBreak: LatexPlugin = {
	commands: [...PAGE_BREAKS],
	face: (part, core) => (part.kind === 'command' ? dividerFace('Page break', core.source) : undefined),
	settings: (source) => (readPageBreak(source) ? PageBreakSettings : null),
	document: pageBreakDocument
};
