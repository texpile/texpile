import { alignSideOf, linesOfEdges, type TableLook } from '$lib/languages/typst/visual/core';
import { sharesOutWidth, typstCellEdges } from './typstTableEdges';
import { setTypstLines } from './typstTableLines';

export const typstTableLook: TableLook = {
	edgesOf: typstCellEdges,
	fillsWidth: sharesOutWidth,
	sideIn: ([holder]) => (holder ? alignSideOf(holder) : null),
	linesOf: (table) => linesOfEdges(table, typstCellEdges(table, false)),
	setLines: setTypstLines
};
