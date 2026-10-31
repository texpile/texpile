import { describe, expect, it } from 'vitest';
import { inlineActionCount } from '$lib/draw/editor/sidebar/sidebarActions';

describe('inlineActionCount', () => {
	it('keeps every action inline at the default width', () => {
		expect(inlineActionCount(256, 6)).toBe(6);
	});

	it('leaves a slot for the "..." once some do not fit, and never goes below none', () => {
		const shown = inlineActionCount(180, 6);
		expect(shown).toBeLessThan(6);
		expect((shown + 1) * 28).toBeLessThanOrEqual(180 - 32 - 24);
		expect(inlineActionCount(40, 6)).toBe(0);
	});
});
