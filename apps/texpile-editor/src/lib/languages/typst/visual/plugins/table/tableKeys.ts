import { keymap } from 'prosemirror-keymap';
import type { EditorState, Plugin } from 'prosemirror-state';

// Backspace at the start of a box's text right under a table stays put because the join selects the table's last cell
function stayBelowTable(state: EditorState): boolean {
	const { $from, empty } = state.selection;
	if (!empty || $from.parentOffset !== 0 || $from.depth < 2 || !$from.parent.isTextblock || $from.index(-1) !== 0) return false;
	if ($from.node(-1).type.name !== 'typ_env') return false;
	const before = $from.index(-2) > 0 ? $from.node(-2).child($from.index(-2) - 1) : null;
	return !!before && (before.type.name === 'table_wrapper' || before.type.spec.tableRole === 'table');
}

export function tableKeys(): Plugin[] {
	return [keymap({ Backspace: stayBelowTable })];
}
