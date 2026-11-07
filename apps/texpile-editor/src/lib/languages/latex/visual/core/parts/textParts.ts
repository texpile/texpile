// the plain parts a chip's drawing is made of: text, a character, and a run styled or colored as a command sets it
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

/** `parts` inside one element styled as `look`; a part on a line of its own cannot sit in a styled run */
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
