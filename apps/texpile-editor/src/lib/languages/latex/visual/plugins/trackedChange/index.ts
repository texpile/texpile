import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { mandatoryArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { changeFace } from './changeFace';

export const trackedChange: LatexPlugin = {
	role: { commands: (name) => commonFacts(name).change !== undefined },
	overDefinition: true,
	face(part, core) {
		const change = commonFacts(part.name).change;
		const args = part.kind === 'command' ? mandatoryArgs(part.call) : [];
		if (!change || args.length < 3) return undefined;
		const text = core.draw(args[args.length - 1]);
		return text?.length ? changeFace(change, core.text(args[args.length - 3]), core.text(args[args.length - 2]), text) : null;
	}
};
