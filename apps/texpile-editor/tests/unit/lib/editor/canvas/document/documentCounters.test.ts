import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { BlockIndex } from '$lib/editor/canvas/document/blockIndex';
import { ModelCounters } from '$lib/editor/canvas/document/documentCounters';
import { testSchema } from '../testing/testCanvasView';

const figure = (label: string, numbered = true) => testSchema.node('image', { label, numbered });
const text = (words: string) => testSchema.node('paragraph', null, [testSchema.text(words)]);

describe('document counters', () => {
	it('number labeled, numbered figures across blocks and inside them, the figure at pos counting itself', () => {
		const doc = testSchema.node('doc', null, [
			figure('fig:a'),
			text('one'),
			figure(''),
			testSchema.node('blockquote', null, [figure('fig:b'), figure('fig:c', false), figure('fig:d')]),
			figure('fig:e')
		]);
		const index = new BlockIndex(doc);
		const counters = new ModelCounters(index);
		const figures: number[] = [];
		doc.descendants((node, pos) => {
			if (node.type.name === 'image') figures.push(counters.at(pos, 'figure'));
		});
		expect(figures).toEqual([1, 1, 2, 2, 3, 4]);
	});

	it('recount only what a transaction replaced', () => {
		const doc = testSchema.node('doc', null, [figure('fig:a'), text('one'), figure('fig:b')]);
		const state = EditorState.create({ doc });
		const index = new BlockIndex(doc);
		const counters = new ModelCounters(index);
		const lastFigure = doc.child(0).nodeSize + doc.child(1).nodeSize;
		expect(counters.at(lastFigure, 'figure')).toBe(2);
		const next = state.apply(state.tr.setNodeMarkup(0, null, { label: '', numbered: true })).doc;
		counters.replaced(index.update(next));
		expect(counters.at(lastFigure, 'figure')).toBe(1);
	});
});
