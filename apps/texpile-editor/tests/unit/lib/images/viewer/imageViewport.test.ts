import { describe, expect, it } from 'vitest';
import { ImageViewport } from '$lib/images/viewer/imageViewport.svelte';

describe('an image under a bar floating over the viewer', () => {
	it('fits in the room below the bar, and can be panned out from under it when zoomed', () => {
		const view = new ImageViewport(54);
		view.setBox(800, 600);
		view.setNatural(400, 2000);
		expect(view.y).toBeGreaterThanOrEqual(54);
		expect(view.y + view.natural.h * view.scale).toBeLessThanOrEqual(600);

		view.zoomTo(1);
		view.pan(0, 10_000);
		expect(view.y).toBe(54);
	});
});
