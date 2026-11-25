import { isFigureBlock } from '$lib/draw/host/card/figureBlocks';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import type { ChipShows } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import { isRawFigure } from '$lib/editor/visual/extensions/raw-latex/rawFigureGraphics';
import { inlinePlaceholder } from '$lib/editor/visual/extensions/raw-latex/inlinePlaceholderView';
import { placeholderCommand } from '$lib/editor/visual/extensions/raw-latex/placeholderView';
import { isIeeeAuthorBlock } from './template-specific/ieeeAuthor';

export function blockChipShows(text: string): ChipShows {
	const placeholder = placeholderCommand(text);
	if (placeholder) return placeholder.command === 'printbibliography' ? 'bibliography' : 'placeholder';
	if (isIeeeAuthorBlock(text)) return 'ieee-author';
	if (isFigureBlock(tikzLanguage, text)) return 'figure-card';
	if (isRawFigure(text)) return 'raw-figure';
	return 'face';
}

export function inlineChipShows(text: string): ChipShows {
	return inlinePlaceholder(text) ? 'placeholder' : 'face';
}
