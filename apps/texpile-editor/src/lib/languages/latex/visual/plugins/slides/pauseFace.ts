// \pause as a small mark in the line, where the slide stops showing and starts again
import { faceElement, tippedFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function pauseFace(source: string): ChipFace {
	const dom = faceElement('span', 'drawn-pause', m.slide_pause());
	return tippedFace(dom, source, { character: true });
}
