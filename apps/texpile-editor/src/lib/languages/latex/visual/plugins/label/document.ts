import { mandatoryArgs, plainText, type LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { labelNodeSpec } from './node/labelSchema';

export const labelDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			label: (im, call) => {
				const braced = mandatoryArgs(call);
				const name = plainText(im, braced[braced.length - 1]);
				return [name ? im.core.node('label', { name }) : im.core.chip(call)];
			}
		}
	},
	schema: ({ nodes, marks }) => ({ nodes: nodes.addToEnd('label', labelNodeSpec), marks }),
	// a \label names the counter last stepped, so its position is its meaning
	save: { nodes: { label: (node) => `\\label{${String(node.attrs.name ?? '')}}` } }
};
