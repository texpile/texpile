import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { floatPart, isFloatEnvironment } from './floatFace';
import { floatDocument } from './document';
import { figureGroupView } from './figureGroup/figureGroupView.svelte';
import { floatCaptionView } from './floatCaption/floatCaptionView';

export const float: LatexPlugin = {
	role: { environments: isFloatEnvironment },
	face: (part, core) =>
		part.kind === 'environment' ? floatPart(part.node, core.src, { unitsOf: core.unitsOf, draw: core.drawUnits }) : undefined,
	document: floatDocument,
	views: () => ({ figure_group: figureGroupView, float_caption: floatCaptionView })
};
