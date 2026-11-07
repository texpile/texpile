// one with no item before it stays, as LyX keeps a depth to one past the paragraph above
import { createIndentListCommand } from 'prosemirror-flat-list';
import type { Command } from 'prosemirror-state';

export function indentListItem(): Command {
	const indent = createIndentListCommand();
	return (state, dispatch, view) => {
		const { $from } = state.selection;
		for (let depth = $from.depth; depth > 0; depth--) {
			if ($from.node(depth).type.name !== 'list') continue;
			const index = $from.index(depth - 1);
			const before = index > 0 ? $from.node(depth - 1).child(index - 1) : null;
			return before?.type.name === 'list' ? indent(state, dispatch, view) : true;
		}
		return indent(state, dispatch, view);
	};
}
