import { tippedFace, type ChipFace } from '../chipFace';
import { chipElement } from '../looks/chipLooks';
import { m } from '$lib/paraglide/messages';

export function labelFace(name: string): ChipFace {
	const dom = chipElement('span', 'drawn-label');
	dom.setAttribute('data-label', name);
	dom.textContent = name;
	return tippedFace(dom, m.drawn_label_title({ name }));
}
