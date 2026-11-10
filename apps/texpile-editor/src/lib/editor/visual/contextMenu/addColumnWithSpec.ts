// a column added to a LaTeX table copies its neighbor's colspec entry, or LaTeX stops on the extra &
import type { Command } from 'prosemirror-state';
import { addColumnAfter, addColumnBefore, isInTable, selectedRect } from 'prosemirror-tables';
import { insertColspecColumn } from '$lib/languages/latex/parser/colspec';

export function addColumnWithSpec(side: 'before' | 'after'): Command {
	const add = side === 'after' ? addColumnAfter : addColumnBefore;
	return (state, dispatch) => {
		if (!isInTable(state)) return false;
		if (!dispatch) return add(state);
		const rect = selectedRect(state);
		const { env, colspec } = rect.table.attrs;
		const at = side === 'after' ? rect.right : rect.left;
		const widened =
			env && typeof colspec === 'string' ? insertColspecColumn(colspec, at, side === 'after' ? rect.right - 1 : rect.left) : null;
		return add(state, (tr) => dispatch(widened === null ? tr : tr.setNodeAttribute(rect.tableStart - 1, 'colspec', widened)));
	};
}
