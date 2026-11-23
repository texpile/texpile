// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { VisualView } from '$lib/editor/canvas';
import { caretEdgeFrom } from '$lib/editor/canvas/interaction/motion/caretTextblocks';
import { createTestCanvasView, settleTestView } from '../../testing/testCanvasView';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		text: { group: 'inline' },
		paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
		math: { content: 'text*', group: 'block', atom: true, toDOM: () => ['div', 0] },
		frame: { content: 'block+', group: 'block', toDOM: () => ['section', 0] }
	}
});
const { paragraph, math, frame } = schema.nodes;

// Ctrl+Left at a slide's title hung the window: the gap inside the slide and the gap before it handed the walk back and forth
it('walks on past a gap inside a container and the gap before it', async () => {
	const doc = schema.node('doc', null, [
		math.create(null, schema.text('1')),
		frame.create(null, [math.create(null, schema.text('2')), paragraph.create(null, schema.text('ab'))])
	]);
	const view = createTestCanvasView(EditorState.create({ doc }));
	await settleTestView(view);
	expect(caretEdgeFrom(view as unknown as VisualView, 4, -1)).toBeNull();
	view.destroy();
});
