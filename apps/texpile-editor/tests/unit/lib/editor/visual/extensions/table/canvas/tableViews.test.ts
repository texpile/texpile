// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { composeNodeViews, type EditorLanguage, type FaceElement } from '$lib/editor/canvas';
import { tableViews } from '$lib/editor/visual/extensions/table/canvas/tableViews';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../../../canvas/testing/testCanvasView';

const { table, table_row, table_cell, table_wrapper, table_caption, paragraph } = schema.nodes;

function grid(widths: (number[] | null)[]): PMNode {
	const cell = (colwidth: number[] | null) => table_cell.create({ colwidth }, paragraph.create());
	return table.create(
		null,
		[0, 1].map(() => table_row.create(null, widths.map(cell)))
	);
}

function open(doc: PMNode, language: EditorLanguage, decorate?: () => Decoration[]) {
	const decorations = new Plugin({ props: { decorations: (state) => DecorationSet.create(state.doc, decorate?.() ?? []) } });
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [decorations] }), {
		props: { language, nodeViews: composeNodeViews(tableViews(language)).nodeViews }
	});
	return { view, at: (pos: number) => view.nodeDOM(pos) as unknown as FaceElement };
}

it('holds a table to its column sizes and keeps it while a cell is typed in', () => {
	const { view, at } = open(schema.nodes.doc.create(null, [grid([null, null, null])]), 'markdown');
	const holder = at(0);
	expect(holder.querySelector('table')?.style.cssText).toContain('min-width: 300px');
	expect(holder.querySelectorAll('col').length).toBe(3);
	view.dispatch(view.state.tr.insertText('x', 4));
	expect(at(0)).toBe(holder);
	const fixed = open(schema.nodes.doc.create(null, [grid([[120], [80]])]), 'typst').at(0);
	expect(fixed.querySelector('table')?.style.cssText).toContain('width: 200px');
});

it('draws the rules a cell is decorated with as solid sides and leaves the rest as a guide', () => {
	const doc = schema.nodes.doc.create(null, [grid([null])]);
	const cellSize = doc.firstChild!.firstChild!.firstChild!.nodeSize;
	const spec = { edgeTop: 'heavy', edgeBottom: null, edgeLeft: true, edgeRight: false, edgeAlign: 'right' };
	const cell = open(doc, 'latex', () => [Decoration.node(2, 2 + cellSize, {}, spec)]).at(2);
	expect(cell.style.getPropertyValue('border-top-width')).toBe('2px');
	expect(cell.style.getPropertyValue('border-top-style')).toBe('solid');
	expect(cell.style.getPropertyValue('border-left-style')).toBe('solid');
	expect(cell.style.getPropertyValue('border-bottom-style')).toBe('dashed');
	expect(cell.style.getPropertyValue('border-bottom-color')).toBe('transparent');
	expect(cell.style.getPropertyValue('text-align')).toBe('right');
	expect(cell.states?.hover).toEqual({
		borderBottomColor: 'var(--color-surface-300-700)',
		borderRightColor: 'var(--color-surface-300-700)'
	});
});

it('prints the caption number a float is handed, or none counted in LaTeX', () => {
	const wrapper = table_wrapper.create({ showNotes: false }, [table_caption.create(), grid([null])]);
	const doc = schema.nodes.doc.create(null, [wrapper]);
	const numbered = open(doc, 'latex', () => [Decoration.node(0, wrapper.nodeSize, {}, { numbers: ['3'] })]);
	expect(numbered.at(1).generatedBefore?.textContent).toBe('Table 3: ');
	const plain = open(doc, 'latex');
	expect(plain.at(1).generatedBefore?.textContent).toBe('Table: ');
	expect(plain.at(0).querySelector('.table-wrapper-content')?.className).toContain('hide-notes');
});
