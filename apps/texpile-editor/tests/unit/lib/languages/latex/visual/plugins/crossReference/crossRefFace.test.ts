// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Decoration } from 'prosemirror-view';
import { crossRefFace } from '$lib/languages/latex/visual/plugins/crossReference/crossRefFace.svelte';

// typing in a caption handed the numbers over again on every key: the chip wrote the same text again, the line
// breaker took it for a change of size, and past six a second it left the chip's paragraph to the browser
it('keeps its text node when the numbers handed over again are the same', () => {
	const face = crossRefFace('Cref', ['tab:weights'], null, '\\Cref{tab:weights}');
	const numbers = (): Decoration[] => [Decoration.node(0, 1, {}, { counted: new Map([['tab:weights', { number: '5', kind: 'table' }]]) })];
	face.decorate?.(numbers());
	const written = face.dom.firstChild;
	expect(face.dom.textContent).toContain('5');
	face.decorate?.(numbers());
	expect(face.dom.firstChild).toBe(written);
	face.destroy?.();
});
