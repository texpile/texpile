// cells added to and taken from the end of a typ_grid
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export function addGridCell(view: EditorView, pos: number): void {
	const grid = view.state.doc.nodeAt(pos);
	if (grid?.type.name !== 'typ_grid') return;
	const { schema } = grid.type;
	const gap = grid.childCount > 1 ? (grid.lastChild!.attrs.gap as string | null) : null;
	const cell = schema.nodes.typ_grid_cell.create({ gap }, schema.nodes.paragraph.create());
	const at = pos + grid.nodeSize - 1;
	const tr = view.state.tr.insert(at, cell);
	view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2))).scrollIntoView());
	view.focus();
}

export function removeGridCell(view: EditorView, pos: number): void {
	const grid = view.state.doc.nodeAt(pos);
	if (grid?.type.name !== 'typ_grid' || grid.childCount < 2) return;
	const end = pos + grid.nodeSize - 1;
	view.dispatch(view.state.tr.delete(end - grid.lastChild!.nodeSize, end));
}
