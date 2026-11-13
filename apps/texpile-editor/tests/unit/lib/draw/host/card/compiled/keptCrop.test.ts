// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { cropSvg, isCropSvg } from '$lib/draw/host/card/compiled/keptCrop';
import { safeSavedDrawing } from '$lib/draw/host/safeSavedDrawing';

// read back from disk, a kept crop goes through the check every saved drawing does
it('keeps its picture and its size through the saved drawing check', () => {
	const kept = safeSavedDrawing(cropSvg('data:image/png;base64,iVBORw0KGgo=', 312.5, 96));
	const svg = new DOMParser().parseFromString(kept ?? '', 'image/svg+xml').documentElement;
	expect(svg.getAttribute('width')).toBe('312.5');
	expect(svg.querySelector('image')?.getAttribute('href')).toBe('data:image/png;base64,iVBORw0KGgo=');
	expect(isCropSvg(kept ?? '')).toBe(true);
	expect(isCropSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).toBe(false);
});
