import type { Node } from 'prosemirror-model';
import type {
	Ctx,
	LatexDocumentPlugin,
	LatexSaveCore,
	PmNode,
	TreeEnvironment,
	TreeImport
} from '$lib/languages/latex/visual/core/document';
import { tableBlocks, tableWrapperBlocks } from './import/tableTree';
import { isTableRuleWithoutArguments } from './import/tableRules';
import { serializeCell, serializeRowCells, serializeTable } from './save/tableSerializer';
import { tableFrameHolds } from './save/tableFrame';

function grid(im: TreeImport, env: TreeEnvironment): PmNode[] {
	return tableBlocks(im, env);
}

function whole(node: Node, _ctx: Ctx, core: LatexSaveCore): string {
	return serializeTable(node, core.node);
}

export const tableDocument: LatexDocumentPlugin = {
	import: {
		environments: {
			table: tableWrapperBlocks,
			'table*': tableWrapperBlocks,
			tabular: grid,
			'tabular*': grid,
			tabularx: grid,
			longtable: grid
		},
		reads: isTableRuleWithoutArguments
	},
	save: {
		endsParagraph: ['table_wrapper'],
		frameHolds: tableFrameHolds,
		nodes: {
			table_wrapper: whole,
			table: whole,
			table_caption: whole,
			table_notes: whole,
			table_row: (node, ctx, core) => serializeRowCells(node, ctx.parent?.type.name === 'table' ? ctx.parent : null, core.node),
			table_cell: (node, ctx, core) => serializeCell(node, ctx.index === 0, core.node),
			table_header: whole
		}
	}
};
