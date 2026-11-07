// Enter at the start of a named environment's first item makes the new item in front of it: it names the same environment
import type { Command } from 'prosemirror-state';
import { listKeymap } from 'prosemirror-flat-list';

function isNamedEnvironmentItem(attrs: Record<string, unknown>): boolean {
	return attrs.kind === 'bullet' && typeof attrs.envName === 'string' && !!attrs.envName && typeof attrs.itemCmd === 'string';
}

export function enterKeepingListEnvironment(...[state, dispatch, view]: Parameters<Command>): boolean {
	const { $from } = state.selection;
	let listDepth = $from.depth;
	while (listDepth > 0 && $from.node(listDepth).type.name !== 'list') listDepth--;
	const before = listDepth > 0 ? $from.before(listDepth) : -1;
	const origin = before >= 0 ? state.doc.nodeAt(before) : null;
	if (!origin || !isNamedEnvironmentItem(origin.attrs)) return false;
	return listKeymap.Enter(
		state,
		dispatch &&
			((tr) => {
				const made = tr.doc.nodeAt(before);
				const next = made ? tr.doc.nodeAt(before + made.nodeSize) : null;
				if (made?.type.name === 'list' && made.attrs.envName == null && next?.eq(origin))
					tr.setNodeMarkup(before, undefined, { ...made.attrs, envName: origin.attrs.envName, itemCmd: origin.attrs.itemCmd });
				dispatch(tr);
			}),
		view
	);
}
