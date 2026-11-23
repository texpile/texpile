// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState, Plugin } from 'prosemirror-state';
import { changeDecorations } from '$lib/editor/visual/diff/docChanges';
import { settleTestView, testSchema } from '../../canvas/testing/testCanvasView';
import { createLaidOutTestView, LINE_HEIGHT } from '../../canvas/testing/laidOutTestView';

const { paragraph } = testSchema.nodes;
const para = (text: string) => paragraph.create(null, testSchema.text(text));

it('draws a paragraph the diff took out as a block of its own between its neighbours', async () => {
	const before = testSchema.node('doc', null, [para('kept above'), para('taken out'), para('kept below')]);
	const after = testSchema.node('doc', null, [para('kept above'), para('kept below')]);
	const diff = new Plugin({ props: { decorations: (state) => (state.doc === after ? changeDecorations(before, after) : null) } });
	const plain = createLaidOutTestView(EditorState.create({ doc: after }));
	const shown = createLaidOutTestView(EditorState.create({ doc: after, plugins: [diff] }));
	await settleTestView(plain);
	await settleTestView(shown);
	const below = after.child(0).nodeSize + 1;
	const moved =
		shown.canvas.geometry.caretRect({ pos: below, affinity: 1 })!.y - plain.canvas.geometry.caretRect({ pos: below, affinity: 1 })!.y;
	expect(moved, 'the struck paragraph takes a line of the column').toBeGreaterThanOrEqual(LINE_HEIGHT);
	plain.destroy();
	shown.destroy();
});
