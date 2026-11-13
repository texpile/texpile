import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { hiddenNotesCaret } from '$lib/editor/visual/extensions/table/caret/hiddenNotesCaret';
import { createTableNode } from '$lib/editor/visual/tableUtils';

function startOf(doc: Node, name: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.type.name === name) at = pos + 1;
	});
	return at;
}

// Down from a new table's last row put the caret in its hidden notes, where typing went into the file unseen
it('passes the notes a float hides, in the way the caret was heading', () => {
	const paragraph = (text: string) => schema.node('paragraph', null, [schema.text(text)]);
	const doc = schema.node('doc', null, [paragraph('before'), createTableNode(schema, 1, 1), paragraph('after')]);
	const notes = startOf(doc, 'table_notes');
	const from = (pos: number) => EditorState.create({ doc, plugins: [hiddenNotesCaret], selection: TextSelection.create(doc, pos) });
	const landed = (state: EditorState) => state.apply(state.tr.setSelection(TextSelection.create(doc, notes))).selection.$head.parent;
	expect(landed(from(startOf(doc, 'table_cell') + 1)).textContent).toBe('after');
	expect(landed(from(doc.content.size - 1)).type.name).toBe('paragraph');
	expect(landed(from(doc.content.size - 1)).textContent).toBe('');
});
