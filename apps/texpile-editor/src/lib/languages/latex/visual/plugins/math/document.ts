import type { NodeSpec } from 'prosemirror-model';
import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { blockMathOf, FORMULA_ENVIRONMENTS } from './import/mathTree';
import { blockMathLatex } from './save/blockMathLatex';

// unset until the editor places the display: one the import reads always says, from the file
function placedLater(block: NodeSpec): NodeSpec {
	const attrs = { ...block.attrs, inParagraph: { default: null }, continuesAfter: { default: null } };
	return { ...block, attrs, gapAttrs: ['inParagraph', 'continuesAfter'] };
}

export const mathDocument: LatexDocumentPlugin = {
	schema: ({ nodes, marks }) => ({ nodes: nodes.update('block_math', placedLater(nodes.get('block_math')!)), marks }),
	import: {
		roles: {
			math: (im, env) => (im.core.holdsNonMath(env.node) || !FORMULA_ENVIRONMENTS.has(env.name) ? [im.core.raw(env)] : blockMathOf(im, env))
		}
	},
	save: { endsParagraph: ['block_math'], nodes: { block_math: blockMathLatex } }
};
