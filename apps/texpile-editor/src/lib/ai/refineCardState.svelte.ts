// Where the Refine card is open: beside whatever asked for it, or nowhere
import { box } from '$lib/runes/box.svelte';
import { refiner } from './selectionRefiner';

export const refineCard = box<{ anchor: DOMRect } | null>(null);

/** a box to sit against: the toolbar's button, or the selected text for a card opened from the menu */
export function openRefineCard(anchor: DOMRect): void {
	const r = refiner.current;
	if (!r?.available || r.busy) return;
	refineCard.current = { anchor };
}

export function closeRefineCard(): void {
	refineCard.current = null;
}
