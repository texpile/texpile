import { it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { gluedLabels } from '$lib/languages/latex/visual/plugins/label/node/labelSpacing';

// a block's labels are kept while the block is the same node, so their places must follow the blocks before it
it('finds a glued label where it sits after an edit in an earlier block', () => {
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, [schema.text('one')]),
		schema.node('paragraph', null, [schema.text('see'), schema.nodes.label.create({ name: 'a' }), schema.text(' there')])
	]);
	expect([...gluedLabels(doc)]).toEqual([[9, 'before']]);
	const typed = EditorState.create({ doc }).tr.insertText('xy', 2).doc;
	expect(typed.child(1)).toBe(doc.child(1));
	expect([...gluedLabels(typed)]).toEqual([[11, 'before']]);
});
