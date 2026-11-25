// how a LaTeX raw chip draws, from its source alone (chipShows)
import type { ChipDrawing } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import { blockChipShows, inlineChipShows } from '../../extensions/chipViewKind';
import { latexFace } from '../walk/drawUnits';

export const LATEX_CHIP_DRAWING: ChipDrawing = {
	language: 'latex',
	shows: (source, block) => (block ? blockChipShows(source) : inlineChipShows(source)),
	face: latexFace
};
