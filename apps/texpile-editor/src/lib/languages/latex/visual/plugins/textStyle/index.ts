import { mandatoryArgs, STYLED, styledPart, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { readTextStyle, TEXT_STYLE_NAMES } from './textStyleCommand';
import TextStyleSettings from './TextStyleSettings.svelte';
import { textStyleDocument } from './document';

export const textStyle: LatexPlugin = {
	commands: [...new Set([...Object.keys(STYLED), ...TEXT_STYLE_NAMES])],
	opensChip: (name) => Object.hasOwn(STYLED, name),
	face(part, core) {
		if (part.kind !== 'command' || !Object.hasOwn(STYLED, part.name)) return undefined;
		const inner = core.draw(mandatoryArgs(part.call)[0]);
		return inner && styledPart(STYLED[part.name], inner, false);
	},
	settings: (source) => (readTextStyle(source) ? TextStyleSettings : null),
	document: textStyleDocument
};
