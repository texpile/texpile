import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { buildTableNode, tableParts, tableSeg } from './import/tableImport';
import { tableFigureCode, tableFigureSeg } from './import/tableFigure';
import { tableSchema } from './tableSchema';
import { tableSaves } from './save/tableSaves';
import { tableFrame } from './save/tableSerializer';
import { readTable } from './drawn/tableCall';

export const tableDocument: TypstDocumentPlugin = {
	import: {
		calls: {
			blocks: { table: tableSeg, figure: tableFigureSeg },
			code: {
				table: (im, call) => {
					const parts = tableParts(im, call);
					return parts ? buildTableNode(im, parts) : null;
				},
				figure: tableFigureCode
			}
		},
		chips: (source) => readTable(source.trim()) !== null
	},
	schema: tableSchema,
	save: {
		nodes: tableSaves,
		stringBody: (node) => node.type.name === 'table_caption' && node.attrs.typString === true,
		frameHolds: (node, parsed) => node.type.name !== 'table' || tableFrame(node) === tableFrame(parsed)
	}
};
