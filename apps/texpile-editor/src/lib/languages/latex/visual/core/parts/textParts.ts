import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { Look } from '$lib/languages/latex/drawnCommands';
import { cssColor } from '../reading/texColor';

export function textPart(text: string): ChipFace {
	const dom = document.createElement('span');
	dom.textContent = text;
	return { dom };
}

export function characterPart(text: string): ChipFace {
	return { ...textPart(text), character: true };
}

export function styledPart(look: Look, parts: ChipFace[], block: boolean): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, block);
	const dom = document.createElement('span');
	Object.assign(dom.style, look);
	dom.appendChild(face.dom);
	return { dom, decorate: face.decorate, destroy: face.destroy };
}

export function coloredPart(color: string, parts: ChipFace[] | null): ChipFace | null {
	const css = cssColor(color);
	return css && parts ? styledPart({ color: css }, parts, false) : null;
}
