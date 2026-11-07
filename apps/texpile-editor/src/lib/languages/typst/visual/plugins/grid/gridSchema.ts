// a typ_grid and its cells
import type { NodeSpec } from 'prosemirror-model';

// `#grid(columns: 2, [a], [b])`: args is every byte between the parenthesis and the first cell (the named arguments, their
// commas and the comma after them), tail the bytes between the last cell and the closing parenthesis. A cell's gap is
// what the file put between it and the cell before (null: the editor's `, `). A cell is a content block, or code that is
// the argument as written (a figure, a spread) when `code` is set; bodyLead and bodyTrail are as an environment's
export const typGridSpec: NodeSpec = {
	content: 'typ_grid_cell+',
	group: 'block',
	definingAsContext: true,
	allowGapCursor: true,
	attrs: {
		args: { default: '' },
		tail: { default: '' },
		label: { default: null },
		labelGap: { default: null },
		typIndent: { default: null }
	},
	parseDOM: [{ tag: 'div.typ-grid' }],
	toDOM: () => ['div', { class: 'typ-grid' }, 0]
};
export const typGridCellSpec: NodeSpec = {
	content: 'block+',
	isolating: true,
	attrs: { gap: { default: null }, bodyLead: { default: null }, bodyTrail: { default: null }, code: { default: false } },
	parseDOM: [{ tag: 'div.typ-grid-cell' }],
	toDOM: (node) => ['div', { class: node.attrs.code ? 'typ-grid-cell typ-grid-code' : 'typ-grid-cell' }, 0]
};
