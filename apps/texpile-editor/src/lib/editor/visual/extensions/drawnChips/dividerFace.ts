// a structural command drawn as a labelled line across the column (a page break, the appendix, the bibliography)
import { tip } from '$lib/components/tooltip.svelte';
import type { ChipFace } from './chipFace';

export function dividerFace(label: string, source: string): ChipFace {
	const dom = document.createElement('span');
	dom.className = 'drawn-divider';
	const text = dom.appendChild(document.createElement('span'));
	text.className = 'drawn-divider-label';
	text.textContent = label;
	const tipped = tip(dom, source);
	return { dom, line: true, destroy: () => tipped.destroy() };
}
