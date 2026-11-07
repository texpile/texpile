import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { algorithmPart, isAlgorithmEnvironment } from './algorithmFace';
import { drawsAsItem, itemPart } from './algorithmItem';

export const algorithm: LatexPlugin = {
	role: { commands: drawsAsItem, environments: isAlgorithmEnvironment },
	face(part, core) {
		const drawer = { unitsOf: core.unitsOf, draw: core.drawUnits, drawSource: core.drawSource };
		if (part.kind === 'command') return itemPart(part.call, core.src, drawer);
		return part.kind === 'environment' ? algorithmPart(part.node, core.src, drawer) : undefined;
	}
};
