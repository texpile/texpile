// @vitest-environment jsdom
// the table float's panel opened from the handle's gear: its props read the float as it is after each of its edits
import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { tableWrapperPanelProps } from '$lib/editor/visual/extensions/table/canvas/wrapperSettings';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../../../canvas/testing/testCanvasView';

const { doc, table, table_row, table_cell, table_wrapper, table_caption, paragraph } = schema.nodes;

function openPanel() {
	const rows = [0, 1].map(() => table_row.create(null, [table_cell.create(null, paragraph.create())]));
	const float = table_wrapper.create(null, [table_caption.create(null, schema.text('Cap')), table.create(null, rows)]);
	const view = createTestCanvasView(EditorState.create({ doc: doc.create(null, [float]) }));
	const block = {
		view,
		getPos: () => 0,
		get node() {
			return view.state.doc.nodeAt(0)!;
		}
	};
	return { view, props: tableWrapperPanelProps('latex', block) };
}

it('shows a row rule set through the panel at once', () => {
	const { props } = openPanel();
	expect(props.rowRules).toEqual(['', '']);
	props.setRowRule(1, '\\hline');
	props.setBottomRule('\\bottomrule');
	expect(props.rowRules).toEqual(['', '\\hline']);
	expect(props.bottomRule).toBe('\\bottomrule');
});

it('adds the notes section with its switch and takes it away again', () => {
	const { view, props } = openPanel();
	props.updateAttrs({ showNotes: true });
	expect(view.state.doc.firstChild!.lastChild!.type.name).toBe('table_notes');
	expect(props.node.attrs.showNotes).toBe(true);
	props.updateAttrs({ showNotes: false });
	expect(view.state.doc.firstChild!.lastChild!.type.name).toBe('table');
});
