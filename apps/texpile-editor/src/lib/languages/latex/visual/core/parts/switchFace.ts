// a font, size, color or alignment switch with no text of its own to style: what it sets, small and muted
import { faceElement, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import './switchFace.css';

export function switchFace(name: string, source: string): ChipFace {
	const dom = faceElement('span', 'drawn-switch', name);
	return tippedFace(dom, source);
}
