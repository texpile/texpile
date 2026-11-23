import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { BlockIndex } from '$lib/editor/canvas/document/blockIndex';
import { testSchema } from '../testing/testCanvasView';

describe('the block index', () => {
	it('keeps the entries of untouched blocks and moves their positions after an edit', () => {
		const doc = testSchema.node(
			'doc',
			null,
			['alpha', 'beta', 'gamma'].map((t) => testSchema.node('paragraph', null, [testSchema.text(t)]))
		);
		const index = new BlockIndex(doc);
		const [first, second, third] = index.blocks;
		const state = EditorState.create({ doc });
		const next = state.apply(state.tr.insertText('ta', doc.child(0).nodeSize + 3)).doc;
		const change = index.update(next);
		expect(change.from).toBe(1);
		expect(change.to).toBe(2);
		expect(change.removed).toEqual([second]);
		expect(index.blocks[0]).toBe(first);
		expect(index.blocks[2]).toBe(third);
		expect(index.blocks[1].node).toBe(next.child(1));
		expect(third.pos).toBe(next.child(0).nodeSize + next.child(1).nodeSize);
		expect(index.indexAt(third.pos)).toBe(2);
		expect(index.indexAt(third.pos - 1)).toBe(1);
	});
});
