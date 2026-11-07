import { faceElement, tippedFace, type ChipFace } from '../chipFace';
import { m } from '$lib/paraglide/messages';

export function labelFace(name: string): ChipFace {
	const dom = faceElement('span', 'drawn-label text-muted bg-surface-200-800 rounded-base px-1.5 py-0.5 align-baseline font-mono text-xs');
	dom.setAttribute('data-label', name);
	dom.textContent = name;
	return tippedFace(dom, m.drawn_label_title({ name }));
}
