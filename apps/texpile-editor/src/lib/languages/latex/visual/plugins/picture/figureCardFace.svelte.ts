import { mount, unmount } from 'svelte';
import {
	cachedDrawing,
	faceElement,
	FigureCard,
	figureSummary,
	loadSavedDrawing,
	onCompiledChange,
	onDrawingsChange,
	OPEN_FIGURE,
	pictureKey,
	resolveCardPicture,
	tikzLanguage,
	type ChipFace,
	type OpenFigureDetail
} from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import './pictures.css';

export function figureCardFace(picture: string): ChipFace {
	const dom = faceElement('div', 'drawn-picture figure-card group');
	const key = pictureKey(picture);
	// the card is found by its text; the index counts the cards of the body, which this one has no place among
	const detail: OpenFigureDetail = { index: -1, source: picture };
	const card = $state({
		svg: null as string | null,
		compiled: null as Awaited<ReturnType<typeof resolveCardPicture>>['compiled'],
		title: m.figure_card_tikz(),
		summary: figureSummary(tikzLanguage, picture),
		onedit: () => window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail }))
	});
	let looked = 0;
	function show(): void {
		const look = ++looked;
		card.svg = cachedDrawing(key);
		if (!card.svg) void loadSavedDrawing(key);
		void resolveCardPicture(key, picture, detail.index).then((shown) => {
			if (look !== looked) return;
			card.svg = shown.svg;
			card.compiled = shown.compiled;
		});
	}
	const mounted = mount(FigureCard, { target: dom, props: card });
	const stopListening = onDrawingsChange(show);
	const stopWatchingCompiles = onCompiledChange(show);
	show();
	return {
		dom,
		line: true,
		destroy() {
			stopListening();
			stopWatchingCompiles();
			looked++;
			void unmount(mounted);
		}
	};
}
