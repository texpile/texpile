import { mandatoryArgs, plainText, type LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { labelNodeSpec } from './node/labelSchema';

export const labelDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			// table_wrapper, figure and block_math take their own labels first; one reaching here stands alone
			label: (im, call) => {
				const braced = mandatoryArgs(call);
				const name = plainText(im, braced[braced.length - 1]);
				return [name ? im.core.node('label', { name }) : im.core.chip(call)];
			}
		}
	},
	schema: ({ nodes, marks }) => ({ nodes: nodes.addToEnd('label', labelNodeSpec), marks }),
	// back exactly where it stood: a \label names whichever counter was last incremented, so its
	// position IS its meaning, and moving it would silently repoint it
	save: { nodes: { label: (node) => `\\label{${String(node.attrs.name ?? '')}}` } }
};
