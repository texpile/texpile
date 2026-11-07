// the pictures a chip can hold: a TikZ picture the figure editor reads, and an xy-pic diagram, which nothing in the app
// typesets
import type { SyntaxNode } from '@lezer/common';
import { tikzLanguage, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import { figureCardFace } from './figureCardFace.svelte';
import { pictureFace } from './pictureFace';

export function xyPictureFace(): ChipFace {
	return pictureFace(m.figure_card_xy(), '');
}

export function picturePart(node: SyntaxNode, src: string): ChipFace | null {
	const text = src.slice(node.from, node.to);
	const pictures = tikzLanguage.listPictures(text);
	if (pictures.length !== 1 || pictures[0].from !== 0 || pictures[0].to !== text.length) return null;
	return figureCardFace(text);
}
