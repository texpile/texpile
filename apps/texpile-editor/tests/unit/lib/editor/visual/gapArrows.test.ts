import { expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { DecorationSet } from 'prosemirror-view';
import { heldGapCursor } from '$lib/editor/visual/gapArrows';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		text: { group: 'inline' },
		paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
		title: { content: 'inline*', isolating: true, toDOM: () => ['h1', 0] },
		frame: { content: 'title? block+', group: 'block', toDOM: () => ['section', 0] },
		math: { content: 'text*', group: 'block', atom: true, toDOM: () => ['div', 0] },
		card: { content: 'text*', group: 'block', createGapCursor: true, toDOM: () => ['div', 0] },
		cell: { content: 'paragraph+', toDOM: () => ['div', 0] },
		table: { content: 'cell+', group: 'block', createGapCursor: true, toDOM: () => ['div', 0] }
	}
});
const { math } = schema.nodes;
const words = (text: string) => schema.text(text);

// ProseMirror wrote its own range over the one held in the bar, and Safari moved that into a code block further down
it("draws the gap cursor's bar as a widget whose range ProseMirror leaves alone", () => {
	const doc = schema.node('doc', null, [math.create(null, words('a')), math.create(null, words('b'))]);
	const state = EditorState.create({ doc, selection: new GapCursor(doc.resolve(3)) });
	const plugin = heldGapCursor();
	const [bar] = (plugin.props.decorations!.call(plugin, state) as DecorationSet).find();
	expect(bar.spec.ignoreSelection).toBe(true);
	expect(bar.spec.canvas).toEqual({ kind: 'caret' });
});
