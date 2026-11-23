import { faceElement as canvasElement, setLook } from '$lib/editor/canvas';
import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { Look } from '$lib/languages/latex/drawnCommands';
import { coreElement } from '../looks/coreLooks';
import { cssColor } from '../reading/texColor';

export function textPart(text: string): ChipFace {
	return { dom: coreElement('span', '', text) };
}

export function characterPart(text: string): ChipFace {
	return { ...textPart(text), character: true };
}

export function styledPart(look: Look, parts: ChipFace[], block: boolean): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, block);
	const dom = canvasElement('span');
	setLook(dom, look);
	dom.appendChild(face.dom);
	return { dom, mixed: face.mixed, decorate: face.decorate, destroy: face.destroy };
}

export function coloredPart(color: string, parts: ChipFace[] | null): ChipFace | null {
	const css = cssColor(color);
	return css && parts ? styledPart({ color: css }, parts, false) : null;
}
