// Typst markup as drawn, and the chip it makes
import { tip } from '$lib/components/tooltip.svelte';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';

export type MarkupDrawing = { dom: HTMLElement; block: boolean; empty: boolean; faces: ChipFace[] };

export function faceOfDrawing(drawing: MarkupDrawing, source: string): ChipFace {
	const tipped = tip(drawing.dom, source);
	return {
		dom: drawing.dom,
		line: drawing.block,
		decorate: (decorations) => drawing.faces.forEach((face) => face.decorate?.(decorations)),
		destroy() {
			drawing.faces.forEach((face) => face.destroy?.());
			tipped.destroy();
		}
	};
}
