// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { windowButtonsAtEnd } from '$lib/chrome/windowOverlay';

function overlay(visible: boolean, x: number, width: number) {
	Object.defineProperty(navigator, 'windowControlsOverlay', {
		configurable: true,
		value: Object.assign(new EventTarget(), { visible, getTitlebarAreaRect: () => ({ x, width }) })
	});
}

describe('windowButtonsAtEnd', () => {
	afterEach(() => {
		delete (navigator as { windowControlsOverlay?: unknown }).windowControlsOverlay;
	});

	it('holds for buttons on the right', () => {
		overlay(true, 0, window.innerWidth - 138);
		expect(windowButtonsAtEnd()).toBe(true);
	});

	it('fails for buttons on the left and for a desktop that draws none', () => {
		overlay(true, 80, window.innerWidth - 80);
		expect(windowButtonsAtEnd()).toBe(false);
		overlay(true, 0, window.innerWidth);
		expect(windowButtonsAtEnd()).toBe(false);
	});

	it('fails with no overlay showing, as on macOS and in full screen', () => {
		overlay(false, 0, 0);
		expect(windowButtonsAtEnd()).toBe(false);
	});
});
