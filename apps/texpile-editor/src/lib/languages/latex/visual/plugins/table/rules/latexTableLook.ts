import { linesOfEdges, type CellAlign, type TableLook } from '$lib/languages/latex/visual/core';
import { cellEdgesOf, fillsStatedWidth } from './tableRuleEdges';
import { setLatexLines } from './latexTableLines';

const SIDE_OF: Record<string, CellAlign> = { flushleft: 'left', center: 'center', flushright: 'right' };

export const latexTableLook: TableLook = {
	edgesOf: cellEdgesOf,
	fillsWidth: fillsStatedWidth,
	sideIn: (holders) => {
		const aligned = holders.find((holder) => holder.type.name === 'environment' && Object.hasOwn(SIDE_OF, String(holder.attrs.name)));
		return aligned ? SIDE_OF[String(aligned.attrs.name)] : null;
	},
	linesOf: (table) => linesOfEdges(table, cellEdgesOf(table)),
	setLines: setLatexLines
};
