// inside a table the selection stays; from the last cell on it takes the table whole and runs on to the next text
import { TextSelection, type Selection } from 'prosemirror-state';
import { CellSelection, TableMap, cellAround } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { nextCaretBlock } from './caretBlocks';

type Axis = 'vertical' | 'horizontal';

function atCellEdge(view: EditorView, axis: Axis, dir: -1 | 1): boolean {
	const { $head } = view.state.selection;
	const $cell = cellAround($head);
	if (!$cell) return false;
	const cell = $cell.nodeAfter!;
	const lastBlock = $head.index($cell.depth + 1) === (dir > 0 ? cell.childCount - 1 : 0);
	if (axis === 'vertical') return lastBlock && view.endOfTextblock(dir > 0 ? 'down' : 'up');
	return lastBlock && $head.parentOffset === (dir > 0 ? $head.parent.content.size : 0);
}

function pastTable(view: EditorView, edge: number, dir: -1 | 1): number {
	const blockPos = nextCaretBlock(view, edge, dir);
	if (blockPos === null) return edge;
	return dir > 0 ? blockPos + 1 : blockPos + view.state.doc.nodeAt(blockPos)!.nodeSize - 1;
}

export function shiftInTable(view: EditorView, table: number, axis: Axis, dir: -1 | 1): Selection | null {
	const { state } = view;
	const { selection } = state;
	const cellSelected = selection instanceof CellSelection;
	if (!cellSelected && !atCellEdge(view, axis, dir)) return null;
	const headCell = cellSelected ? selection.$headCell.pos : cellAround(selection.$head)!.pos;
	const tableNode = state.doc.nodeAt(table)!;
	const map = TableMap.get(tableNode);
	const rect = map.findCell(headCell - table - 1);
	const leaves =
		axis === 'vertical'
			? dir > 0
				? rect.bottom === map.height
				: rect.top === 0
			: dir > 0
				? rect.right === map.width && rect.bottom === map.height
				: rect.left === 0 && rect.top === 0;
	if (!leaves) return selection;
	const end = table + tableNode.nodeSize;
	const anchor = pastTable(view, dir > 0 ? table : end, -dir as -1 | 1);
	const head = pastTable(view, dir > 0 ? end : table, dir);
	return TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(head));
}
