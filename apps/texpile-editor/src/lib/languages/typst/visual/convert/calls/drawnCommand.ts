// the Typst the editor draws: the converter keeps each a chip of its own, never merged with the code beside it
import { isTypstBibliography } from '../../extensions/typstBibliographyView.svelte';
import { readSetup } from '../../core/setup/setupStatements';
import { readInclude } from '../../core/code/includeCall';
import { claimedChip } from '../../core/plugin/documentMap';

/** the core's own chips (the bibliography, the setup, an include) and the ones the plugins draw */
export function typstDrawnCommand(source: string): boolean {
	return isTypstBibliography(source) || readSetup(source) !== null || readInclude(source.trim()) !== null || claimedChip(source);
}
