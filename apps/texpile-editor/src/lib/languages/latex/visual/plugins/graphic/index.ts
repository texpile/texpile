import { argWhere, graphicFace, hasRole, readsArg, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { graphicDocument } from './document';
export const graphic: LatexPlugin = {
	role: { commands: (name) => readsArg(name, hasRole('graphic')) },
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const file = core.text(argWhere(part.call, hasRole('graphic'))).trim();
		return file ? graphicFace(file) : null;
	},
	document: graphicDocument
};
