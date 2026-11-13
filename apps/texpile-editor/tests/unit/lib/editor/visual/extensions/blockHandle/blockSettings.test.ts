// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
	PASSES_BODY_SETTINGS,
	blockSettingsOf,
	offerBlockSettings,
	settingsPlace
} from '$lib/editor/visual/extensions/blockHandle/blockSettings';

// a Typst figure around a grid of pictures had no gear in the handle, and the grid kept its own
it("hands a wrapped body's settings to the handle, and opens them where its gear stands", () => {
	const editor = document.createElement('div');
	editor.setAttribute('data-block-handle', '');
	const figure = editor.appendChild(document.createElement('figure'));
	const grid = figure.appendChild(document.createElement('div'));
	figure.appendChild(document.createElement('figcaption'));
	const settings = { label: () => 'Layout settings', open: () => {} };
	offerBlockSettings(grid, settings);

	expect(blockSettingsOf(figure)).toBeNull();
	expect(settingsPlace(grid)).toBeNull();
	figure.setAttribute(PASSES_BODY_SETTINGS, '');
	expect(blockSettingsOf(figure)).toBe(settings);
	expect(settingsPlace(grid)).not.toBeNull();
});
