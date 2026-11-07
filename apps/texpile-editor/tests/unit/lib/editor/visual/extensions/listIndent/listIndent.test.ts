import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { indentListItem } from '$lib/editor/visual/extensions/listIndent/listIndent';

const item = (text: string) => schema.nodes.list.create({ kind: 'bullet' }, schema.nodes.paragraph.create(null, schema.text(text)));

it('Tab nests an item once under the one above, and a second Tab leaves it there', () => {
	const doc = schema.nodes.doc.create(null, [item('one'), item('two')]);
	let at = 0;
	doc.descendants((n, pos) => {
		if (n.isText && n.text === 'two') at = pos + 3;
	});
	let state = EditorState.create({ doc, selection: TextSelection.create(doc, at) });
	const tab = indentListItem();
	expect(tab(state, (tr) => (state = state.apply(tr)))).toBe(true);
	const nested = state.doc.toString();
	expect(nested).toBe('doc(list(paragraph("one"), list(paragraph("two"))))');
	expect(tab(state, (tr) => (state = state.apply(tr)))).toBe(true);
	expect(state.doc.toString()).toBe(nested);
});
