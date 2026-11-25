// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { stopBeyond, type CanvasNodeViewConstructor, type VisualView } from '$lib/editor/canvas';
import { createTestCanvasView, settleTestView } from '../testing/testCanvasView';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		text: { group: 'inline' },
		paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
		math: { content: 'text*', group: 'block', atom: true, toDOM: () => ['div', 0] },
		card: { content: 'text*', group: 'block', createGapCursor: true, toDOM: () => ['div', 0] },
		figure: { content: 'text*', group: 'block', atom: true, toDOM: () => ['figure', 0] }
	}
});
const { paragraph, math, card, figure } = schema.nodes;
const words = (text: string) => schema.text(text);

// a card drawn with none of its text editable, or one whose nested editor owns its caret (an island)
const cardView =
	(caret: 'drawnBlock' | 'island'): CanvasNodeViewConstructor =>
	(_node, view) => {
		const dom = view.canvas.build.el('div');
		return caret === 'island' ? { dom, contentDOM: dom, setSelection: () => {}, stopEvent: () => false } : { dom };
	};
// a figure whose caption is its text
const figureView: CanvasNodeViewConstructor = (_node, view) => {
	const dom = view.canvas.build.el('figure');
	return { dom, contentDOM: dom };
};

async function stopFrom(doc: PMNode, at: (doc: PMNode) => Selection, dir: -1 | 1, caret: 'drawnBlock' | 'island' = 'drawnBlock') {
	const state = EditorState.create({ doc, selection: at(doc) });
	const view = createTestCanvasView(state, { nodeViews: { card: cardView(caret), figure: figureView } });
	await settleTestView(view);
	const stop = stopBeyond(view as unknown as VisualView, view.state.selection, dir);
	view.destroy();
	return stop;
}

describe('the caret engine across blocks', () => {
	const textThenCard = () => schema.node('doc', null, [paragraph.create(null, words('ab')), card.create(null, words('x'))]);

	it('selects a drawn block from the gap beside it, and goes into one whose text takes the caret', async () => {
		const end = (doc: PMNode) => new GapCursor(doc.resolve(doc.content.size));
		expect(await stopFrom(textThenCard(), end, -1)).toEqual({ kind: 'node', pos: 4 });
		expect(await stopFrom(textThenCard(), end, -1, 'island')).toEqual({ kind: 'text', pos: 6 });
	});

	// \printbibliography and a comment line were walked as text from one side and passed or selected from the other
	it('selects a textblock drawn whole from either side, never a caret inside it', async () => {
		const doc = schema.node('doc', null, [
			paragraph.create(null, words('ab')),
			card.create(null, words('x')),
			paragraph.create(null, words('cd'))
		]);
		expect(await stopFrom(doc, (d) => TextSelection.create(d, 3), 1)).toEqual({ kind: 'node', pos: 4 });
		expect(await stopFrom(doc, (d) => TextSelection.create(d, d.content.size - 1), -1)).toEqual({ kind: 'node', pos: 4 });
	});

	// the arrows went from a selected figure past its caption to the next paragraph
	it('goes from a selected figure into its caption, and back from the caption to the figure', async () => {
		const doc = schema.node('doc', null, [figure.create(null, words('A figure.')), paragraph.create(null, words('after'))]);
		expect(await stopFrom(doc, (d) => NodeSelection.create(d, 0), 1)).toEqual({ kind: 'text', pos: 1 });
		expect(await stopFrom(doc, (d) => TextSelection.create(d, 1), -1)).toEqual({ kind: 'node', pos: 0 });
	});

	it('stops on the gap between two display formulas', async () => {
		const doc = schema.node('doc', null, [math.create(null, words('a')), math.create(null, words('b'))]);
		expect(await stopFrom(doc, (d) => NodeSelection.create(d, 0), 1)).toEqual({ kind: 'gap', pos: 3 });
	});
});
