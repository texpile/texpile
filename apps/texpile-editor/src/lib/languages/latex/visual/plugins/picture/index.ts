import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { picturePart, xyPictureFace } from './picturePart';

export const picture: LatexPlugin = {
	// xy-pic's diagrams, which the package data does not mark as pictures
	commands: ['xymatrix', 'xygraph'],
	environments: ['tikzpicture', 'circuitikz', 'tikzcd', 'forest'],
	opensChip: (_name, kind) => kind === 'commands',
	face(part, core) {
		if (part.kind === 'environment') return picturePart(part.node, core.src);
		return part.kind === 'command' || part.kind === 'math' ? xyPictureFace() : undefined;
	}
};
