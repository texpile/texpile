import { chipWithoutPar, type LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { hardBreakLatex, lineBreak, newline } from './breaks';

export const spacingDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			'\\': lineBreak,
			newline,
			par: () => null,
			// a leading one is the paragraph's indent; anywhere else it prints one
			indent: (im, call, ctx) => [im.core.chip(call, ctx)],
			vspace: chipWithoutPar
		}
	},
	save: { nodes: { hard_break: hardBreakLatex } }
};
