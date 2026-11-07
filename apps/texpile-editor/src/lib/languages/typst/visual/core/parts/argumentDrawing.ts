import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { unquote } from '../../convert/reading/syntaxUtils';
import type { TypstDrawer } from '../plugin/typstPlugin';
import { blockMarkup, type CallArg } from '../reading/typstCall';

export type ArgumentDrawing = { dom: HTMLElement; block: boolean; faces: ChipFace[] };

export function drawArgument(arg: CallArg, drawer: TypstDrawer): ArgumentDrawing | null {
	if (arg.kind === 'None') return { dom: document.createElement('span'), block: false, faces: [] };
	if (arg.kind === 'Str') {
		const dom = document.createElement('span');
		dom.textContent = unquote(arg.value);
		return { dom, block: false, faces: [] };
	}
	if (arg.kind === 'ContentBlock' || arg.kind === 'Equation') {
		const drawing = drawer.drawMarkup(arg.kind === 'Equation' ? arg.value : blockMarkup(arg));
		return drawing && { dom: drawing.dom, block: drawing.block, faces: drawing.faces };
	}
	const face = drawer.draw(`#${arg.value}`);
	if (face) return { dom: face.dom, block: !!face.line, faces: [face] };
	const drawing = drawer.drawMarkup(`#${arg.value}`);
	return drawing && { dom: drawing.dom, block: drawing.block, faces: drawing.faces };
}

export function destroyDrawings(drawings: ArgumentDrawing[]): void {
	for (const drawing of drawings) drawing.faces.forEach((face) => face.destroy?.());
}
