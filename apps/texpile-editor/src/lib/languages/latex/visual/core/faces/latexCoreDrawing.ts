// what the LaTeX core draws chips with, and the drawn inputs the chips read
import { windowInvalidation } from '$lib/editor/canvas';
import { registerChipDrawing } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { onDrawnInputs } from '../drawnInputs.svelte';
import { LATEX_CHIP_DRAWING } from './latexChipDrawing';

const watching = new WeakSet<Window>();

/** the chips that read the drawn inputs (the template's heads, the paper's names) build again when they change */
function watchDrawnInputs(win: Window): void {
	if (watching.has(win)) return;
	watching.add(win);
	onDrawnInputs(() => windowInvalidation(win).fire({ kind: 'store', name: 'drawnInputs' }));
}

export function registerLatexCoreDrawing(): void {
	registerChipDrawing(schema, LATEX_CHIP_DRAWING);
	if (typeof window !== 'undefined') watchDrawnInputs(window);
}
