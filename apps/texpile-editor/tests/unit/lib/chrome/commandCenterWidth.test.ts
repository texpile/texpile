import { describe, expect, it } from 'vitest';
import { commandCenterWidth } from '$lib/chrome/commandCenterWidth';

describe('commandCenterWidth', () => {
	// a guest's title bar: sized for the window's center, the field was 216 wide and 12 from Collaborating
	it('keeps its full width beside a wide side while the room between the sides holds it', () => {
		expect(commandCenterWidth(1280, 280, 520)).toBe(307);
	});

	it('narrows to the room between the sides, and is left out below its least width', () => {
		expect(commandCenterWidth(900, 280, 380)).toBe(216);
		expect(commandCenterWidth(800, 280, 380)).toBe(0);
	});
});
