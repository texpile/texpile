import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { mandatoryArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { headingPart } from './headingPart';
import { headingDocument } from './document';
import { headingArguments, headingInserts } from './headingInsert';

export const heading: LatexPlugin = {
	role: { commands: (name) => commonFacts(name).section != null },
	// the import makes the headings it reads; one left as a chip stays the LaTeX it is
	opensChip: false,
	face(part, core) {
		const level = commonFacts(part.name).section;
		const args = part.kind === 'command' ? mandatoryArgs(part.call) : [];
		if (level == null || !args.length) return undefined;
		const text = core.drawArguments([args[args.length - 1]]);
		return text && headingPart(level, text, core.source);
	},
	document: headingDocument,
	insert: headingInserts,
	arguments: headingArguments
};
