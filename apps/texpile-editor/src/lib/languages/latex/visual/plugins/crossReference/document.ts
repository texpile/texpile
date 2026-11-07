import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { createRef, refLatex } from './node/refNode';
import { refNodeSpec } from './node/refSchema';

export const crossReferenceDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			// \autoref, \cref and \pageref print words or pages only the compile knows
			ref: (im, call) => createRef(im, call, null),
			eqref: (im, call) => createRef(im, call, 'equation')
		}
	},
	schema: ({ nodes, marks }) => ({ nodes: nodes.addToEnd('ref', refNodeSpec), marks }),
	save: { nodes: { ref: refLatex } }
};
