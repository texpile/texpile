import { figureCardFace as cardFace, OPEN_FIGURE, pictureKey, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function figureCardFace(picture: string): ChipFace {
	return cardFace({
		key: pictureKey(picture),
		picture,
		// the card is found by its text; the index counts the cards of the body, which this one has no place among
		index: () => -1,
		title: m.figure_card_tikz(),
		fromPdf: true,
		open: () => window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail: { index: -1, source: picture } }))
	});
}
