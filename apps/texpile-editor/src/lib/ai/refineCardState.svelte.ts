// Where the Refine card is open: beside whatever asked for it, or nowhere
import { box } from '$lib/runes/box.svelte';
import { refiner, type RefineAgent } from './selectionRefiner';

/** agent: the one a menu entry named; the card picks one itself when nothing did */
export const refineCard = box<{ anchor: DOMRect; agent?: RefineAgent } | null>(null);

/** a box to sit against: the toolbar's button, or the selected text for a card opened from the menu */
export function openRefineCard(anchor: DOMRect, agent?: RefineAgent): void {
	const r = refiner.current;
	if (!r?.available || r.busy) return;
	refineCard.current = { anchor, agent };
}

export function closeRefineCard(): void {
	refineCard.current = null;
}
