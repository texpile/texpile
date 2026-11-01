import { describe, expect, it } from 'vitest';
import { pointerNearBox, pointerNearPanels } from '$lib/draw/editor/state/pointerReveal.svelte';

describe('pointerNearPanels', () => {
	const tucked = { left: 0, top: 100, right: 306, bottom: 300 };

	it('reaches out from the edge, level with the panels', () => {
		expect(pointerNearPanels(340, 200, tucked)).toBe(true);
		expect(pointerNearPanels(350, 200, tucked)).toBe(false);
		expect(pointerNearPanels(310, 70, tucked)).toBe(true);
		expect(pointerNearPanels(310, 40, tucked)).toBe(false);
		expect(pointerNearPanels(310, 360, tucked)).toBe(false);
	});
});

describe('pointerNearBox', () => {
	it('reaches out from every side', () => {
		const pill = { left: 900, top: 800, right: 1000, bottom: 836 };
		expect(pointerNearBox(870, 820, pill)).toBe(true);
		expect(pointerNearBox(850, 820, pill)).toBe(false);
		expect(pointerNearBox(1030, 820, pill)).toBe(true);
		expect(pointerNearBox(950, 770, pill)).toBe(true);
		expect(pointerNearBox(950, 750, pill)).toBe(false);
	});
});
