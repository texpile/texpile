import { readsArg, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { captionPart, isCaption } from './captionPart';

export const caption: LatexPlugin = {
	role: { commands: (name) => readsArg(name, isCaption) },
	face: (part, core) => (part.kind === 'command' ? captionPart(part.call, core) : undefined)
};
