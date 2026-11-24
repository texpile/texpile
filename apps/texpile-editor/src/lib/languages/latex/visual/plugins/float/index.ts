import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { floatPart, isFloatEnvironment } from './floatFace';
import { floatDocument } from './document';
import { FIGURE_GROUP_SETTINGS } from './figureGroup/figureGroupSettingsOffer';
import { figureGroupCaptionView, figureGroupView } from './figureGroup/figureGroupView';

export const float: LatexPlugin = {
	role: { environments: isFloatEnvironment },
	face: (part, core) =>
		part.kind === 'environment' ? floatPart(part.node, core.src, { unitsOf: core.unitsOf, draw: core.drawUnits }) : undefined,
	document: floatDocument,
	canvasViews: () => ({
		nodeViews: { figure_group: figureGroupView, figure_caption: figureGroupCaptionView },
		blockSettings: { figure_group: FIGURE_GROUP_SETTINGS }
	})
};
