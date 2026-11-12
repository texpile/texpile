import { linesOfEdges, type TableLook } from '$lib/languages/latex/visual/core';
import { cellEdgesOf, fillsStatedWidth } from './tableRuleEdges';
import { setLatexLines } from './latexTableLines';

export const latexTableLook: TableLook = {
	edgesOf: cellEdgesOf,
	fillsWidth: fillsStatedWidth,
	linesOf: (table) => linesOfEdges(table, cellEdgesOf(table)),
	setLines: setLatexLines
};
