import { mandatoryArgs, MARGIN_NOTES, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { marginNoteFace } from './marginNoteFace';

export const marginNote: LatexPlugin = {
	commands: [...MARGIN_NOTES],
	face(part, core) {
		const args = part.kind === 'command' ? mandatoryArgs(part.call) : [];
		if (!args.length) return undefined;
		const inner = core.drawRun(args[args.length - 1]);
		return inner && marginNoteFace(inner);
	}
};
