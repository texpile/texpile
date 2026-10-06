import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { addColumnBefore, tableEditing } from 'prosemirror-tables';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { typstHeaderRows } from '$lib/languages/typst/visual/extensions/typstHeaderRows';

describe('typst header rows', () => {
	// prosemirror-tables adds a body cell beside a header-only row; written as a body row, typst lost the header
	it('keeps a header row whole when a column is added beside it', () => {
		const doc = typstToProseMirror('#table(columns: 2, table.header([H1], [H2]))\n').doc;
		let state = EditorState.create({ schema: typSchema, doc, plugins: [tableEditing(), typstHeaderRows] });
		state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(4))));
		addColumnBefore(state, (tr) => (state = state.apply(tr)));
		const types: string[] = [];
		state.doc.descendants((n) => {
			if (n.type.name.startsWith('table_') && n.type.name !== 'table_row') types.push(n.type.name);
		});
		expect(types).toEqual(['table_header', 'table_header', 'table_header']);
		expect(serializeToTypst(state.doc)).toContain('table.header([], [H1], [H2])');
	});
});
