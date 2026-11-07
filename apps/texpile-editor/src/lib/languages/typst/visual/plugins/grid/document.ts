import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { gridNode, gridSeg } from './gridImport';
import { typGridCellSpec, typGridSpec } from './gridSchema';
import { gridSource } from './gridSave';

export const gridDocument: TypstDocumentPlugin = {
	import: { calls: { blocks: { grid: gridSeg }, code: { grid: (im, call) => gridNode(im, call, call, null) } } },
	schema: ({ nodes, marks }) => ({ nodes: nodes.addToEnd('typ_grid', typGridSpec).addToEnd('typ_grid_cell', typGridCellSpec), marks }),
	save: {
		nodes: { typ_grid: (node, ctx, core) => gridSource(node, core.body, !!ctx.parent && ctx.parent.type.name !== 'doc') + '\n\n' },
		alone: ['typ_grid']
	}
};
