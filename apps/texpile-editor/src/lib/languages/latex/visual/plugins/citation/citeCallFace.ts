// a citation call drawn as what its form prints: the citation, a superscript or the mark of the footnote that holds it
import { citeFormOf } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { footnoteFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { citeFace } from './citeFace.svelte';
import type { CiteCallGroups } from './citeGroups';

/** `nextFootnote` counts the chip's footnote marks; \footcitetext names its note without a mark */
export function citeCallFace(command: string, groups: CiteCallGroups, source: string, nextFootnote: () => number): ChipFace {
	const form = citeFormOf(command);
	if (form === 'foot') return footnoteFace(command.endsWith('text') || command.endsWith('texts') ? null : nextFootnote(), null, source);
	return citeFace(command, groups, source, form === 'super');
}
