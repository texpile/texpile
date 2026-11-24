// Typst markup as drawn, and the chip it makes
import { tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { PartElement } from '$lib/editor/visual/extensions/drawnChips/faces/partElements';

export type MarkupDrawing = { dom: PartElement; block: boolean; empty: boolean; faces: ChipFace[] };

export function faceOfDrawing(drawing: MarkupDrawing, source: string): ChipFace {
	const face = tippedFace(drawing.dom, source, { line: drawing.block });
	return {
		...face,
		decorate: (decorations) => drawing.faces.forEach((part) => part.decorate?.(decorations)),
		destroy() {
			drawing.faces.forEach((part) => part.destroy?.());
			face.destroy?.();
		}
	};
}
