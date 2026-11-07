import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { figureCode, figureSeg } from './import/figureImport';
import { typFigureCaptionSpec, typFigureSpec } from './figureSchema';
import { typFigureSave } from './figureSave';

export const figureDocument: TypstDocumentPlugin = {
	import: { calls: { blocks: { figure: figureSeg }, code: { figure: figureCode } } },
	schema: ({ nodes, marks }) => ({
		nodes: nodes.addToEnd('typ_figure', typFigureSpec).addToEnd('typ_figure_caption', typFigureCaptionSpec),
		marks
	}),
	save: {
		nodes: { typ_figure: typFigureSave },
		inCall: ['typ_figure_caption'],
		stringBody: (node) => node.type.name === 'typ_figure_caption' && node.attrs.typString === true
	}
};
