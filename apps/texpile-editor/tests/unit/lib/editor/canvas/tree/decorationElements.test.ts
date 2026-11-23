import { expect, it } from 'vitest';
import { Decoration } from 'prosemirror-view';
import { sameDecorationSpecs } from '$lib/editor/canvas/tree/decorationElements';

const numbered = (numbers: string[]) => [Decoration.node(1, 5, {}, { numbers })];

// the numbers plugin counts every node again on each change: equal numbers keep the block's elements
it('reads a numbered block counted again to the same numbers as the same decorations', () => {
	expect(sameDecorationSpecs(numbered(['3.4']), numbered(['3.4']))).toBe(true);
	expect(sameDecorationSpecs(numbered(['3.4']), numbered(['3.5']))).toBe(false);
});
