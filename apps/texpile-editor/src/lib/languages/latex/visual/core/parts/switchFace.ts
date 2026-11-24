import { tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { coreElement } from '../looks/coreLooks';
import './switchFace.css';

export function switchFace(name: string, source: string): ChipFace {
	const dom = coreElement('span', 'drawn-switch', name);
	return tippedFace(dom, source);
}
