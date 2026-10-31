import type { FigureLanguage } from '$lib/draw/editor/figure/figureLanguage';

// what TikZ's language does and CeTZ's does not yet: diagrams, trees, plot editing and circuits; the editor offers none of
// their tools, as the language lists none of their features
export const UNBACKED = {
	readAxis: () => null,
	writeAxis: () => null,
	readPlot: () => null,
	writePlot: () => null,
	addPlot: () => null,
	readGrid: () => null,
	addCell: () => null,
	moveCell: () => null,
	readArrow: () => null,
	writeArrow: () => null,
	arrowCells: () => null,
	pointArrow: () => null,
	addBranch: () => null,
	moveBranch: () => null,
	shiftBranch: () => null,
	circuitParts: [],
	readCircuit: () => [],
	writeCircuit: () => null
} satisfies Partial<FigureLanguage>;
