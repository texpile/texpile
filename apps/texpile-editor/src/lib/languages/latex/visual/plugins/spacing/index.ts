import { printedCharacter } from '$lib/languages/latex/knowledge/commands/texCharacters';
import { HORIZONTAL_SPACES, VERTICAL_SKIPS, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { spacingPart } from './spacingParts';
import { insertsSkip, valueSkipPart } from './valueSkipPart';
import { readSpacing } from './spacingCommand';
import SpacingSettings from './SpacingSettings.svelte';
import { spacingDocument } from './document';
import { spacingInserts } from './spacingInsert';

const BREAKS = ['\\', 'newline'];

export const spacing: LatexPlugin = {
	commands: [
		'vspace',
		'addvspace',
		'vfill',
		'hspace',
		'hfill',
		'hfil',
		...Object.keys(VERTICAL_SKIPS),
		...Object.keys(HORIZONTAL_SPACES),
		...BREAKS
	],
	role: { commands: (name) => insertsSkip(name) && printedCharacter(name) === null },
	opensChip: (name) => !BREAKS.includes(name),
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const space = spacingPart(part.name, part.call, core.src, core.source);
		if (space) return space;
		// the package data has no reading of the kernel's \newline
		if (BREAKS.includes(part.name)) return { dom: document.createElement('br') };
		if (insertsSkip(part.name) && !part.call.args.some((a) => a.present)) return valueSkipPart(part.name, core.source);
		return undefined;
	},
	settings: (source) => (readSpacing(source) ? SpacingSettings : null),
	document: spacingDocument,
	insert: spacingInserts
};
