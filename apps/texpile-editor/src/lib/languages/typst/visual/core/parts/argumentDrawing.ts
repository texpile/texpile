import { FaceElement, faceElement } from '$lib/editor/canvas';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { unquote } from '../../convert/reading/syntaxUtils';
import type { TypstDrawer } from '../plugin/typstPlugin';
import { blockMarkup, type CallArg } from '../reading/typstCall';

export type ArgumentDrawing = { dom: FaceElement; block: boolean; faces: ChipFace[] };

/** an argument drawn on the canvas; null when it cannot be */
export function drawArgument(arg: CallArg, drawer: TypstDrawer): ArgumentDrawing | null {
	if (arg.kind === 'None') return { dom: faceElement('span'), block: false, faces: [] };
	if (arg.kind === 'Str') return { dom: faceElement('span', '', unquote(arg.value)), block: false, faces: [] };
	if (arg.kind !== 'ContentBlock' && arg.kind !== 'Equation') {
		const face = drawer.draw(`#${arg.value}`);
		if (face) return face.dom instanceof FaceElement ? { dom: face.dom, block: !!face.line, faces: [face] } : null;
	}
	const drawing = drawer.drawMarkup(arg.kind === 'Equation' ? arg.value : arg.kind === 'ContentBlock' ? blockMarkup(arg) : `#${arg.value}`);
	if (!drawing) return null;
	if (drawing.dom instanceof FaceElement) return { dom: drawing.dom, block: drawing.block, faces: drawing.faces };
	drawing.faces.forEach((face) => face.destroy?.());
	return null;
}

export function destroyDrawings(drawings: ArgumentDrawing[]): void {
	for (const drawing of drawings) drawing.faces.forEach((face) => face.destroy?.());
}
