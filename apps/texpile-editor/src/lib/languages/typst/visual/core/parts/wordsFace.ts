// words a chip prints, drawn as text with its Typst in the hint
import { tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { typstElement } from '../looks/typstLooks';
import './wordsFace.css';

export function faceOf(text: string, className: string, source: string): ChipFace {
	const dom = typstElement('span', className, text);
	return tippedFace(dom, source);
}
