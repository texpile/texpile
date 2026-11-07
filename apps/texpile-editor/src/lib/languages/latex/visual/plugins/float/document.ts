import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { figureBlocks } from './import/figureTree';
import { isFloat, otherFloatBlocks } from './import/floatTree';
import { serializeFigureGroup } from './save/figureGroupSerializer';
import { floatCaptionOf } from './save/floatCaption';
import { imageLatex } from './save/imageLatex';
import { figureGroupNodeSpecs } from './figureGroup/figureGroupSchema';
import { floatCaptionNodeSpec } from './floatCaption/floatCaptionSchema';

export const floatDocument: LatexDocumentPlugin = {
	import: {
		environments: { figure: figureBlocks, 'figure*': figureBlocks, wrapfigure: figureBlocks },
		environmentBody: { reads: isFloat, blocks: otherFloatBlocks }
	},
	schema: ({ nodes, marks }) => ({ nodes: nodes.addToEnd('float_caption', floatCaptionNodeSpec).append(figureGroupNodeSpecs), marks }),
	save: {
		endsParagraph: ['image', 'figure_group'],
		nodes: {
			image: imageLatex,
			figure_group: (node, _ctx, core) => serializeFigureGroup(node, core.children),
			float_caption: (node, _ctx, core) => `${floatCaptionOf(node, core.children)}\n`
		}
	}
};
