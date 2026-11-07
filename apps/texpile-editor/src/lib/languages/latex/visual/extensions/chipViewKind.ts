// which view a LaTeX chip gets, by its source: a view of its own, else `chip` for a drawn face or the source as written
import { isFigureBlock } from '$lib/draw/host/card/FigureCardView.svelte';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import { isRawFigure } from '$lib/editor/visual/extensions/raw-latex/rawFigureView';
import { inlinePlaceholder } from '$lib/editor/visual/extensions/raw-latex/inlinePlaceholderView';
import { placeholderCommand } from '$lib/editor/visual/extensions/raw-latex/placeholderView';
import { isIeeeAuthorBlock } from './template-specific/ieeeAuthorView';

export type BlockChipView = 'bibliography' | 'placeholder' | 'ieee-author' | 'figure-card' | 'raw-figure' | 'chip';

export function blockChipView(text: string): BlockChipView {
	const placeholder = placeholderCommand(text);
	if (placeholder) return placeholder.command === 'printbibliography' ? 'bibliography' : 'placeholder';
	if (isIeeeAuthorBlock(text)) return 'ieee-author';
	if (isFigureBlock(tikzLanguage, text)) return 'figure-card';
	if (isRawFigure(text)) return 'raw-figure';
	return 'chip';
}

export function inlineChipView(text: string): 'placeholder' | 'chip' {
	return inlinePlaceholder(text) ? 'placeholder' : 'chip';
}
