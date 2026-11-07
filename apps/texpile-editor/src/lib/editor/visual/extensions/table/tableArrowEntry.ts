// an arrow from the block beside a table steps into its facing cell: the browser's own move went past the table's
// chrome to the text beyond it
import { Plugin, Selection, TextSelection } from 'prosemirror-state';
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

type Side = -1 | 1;

/** the boundary to the block beside the caret's textblock, when the caret is at that edge of it */
function edgeCut($head: ResolvedPos, side: Side): ResolvedPos | null {
	if ($head.parentOffset !== (side < 0 ? 0 : $head.parent.content.size) || $head.parent.type.spec.isolating) return null;
	for (let d = $head.depth - 1; d >= 0; d--) {
		const index = $head.index(d);
		if (side < 0 ? index > 0 : index + 1 < $head.node(d).childCount)
			return $head.doc.resolve(side < 0 ? $head.before(d + 1) : $head.after(d + 1));
		if ($head.node(d).type.spec.isolating) return null;
	}
	return null;
}

function tableAtEdge(block: PMNode, side: Side): boolean {
	for (let at: PMNode | null = block; at && !at.isTextblock; at = side < 0 ? at.lastChild : at.firstChild)
		if (at.type.spec.tableRole === 'table') return true;
	return false;
}

function onKey(view: EditorView, event: KeyboardEvent): boolean {
	const side: Side | 0 = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
	if (!side || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
	const { selection } = view.state;
	if (!(selection instanceof TextSelection) || !selection.empty) return false;
	const $cut = edgeCut(selection.$head, side);
	const beside = $cut && (side < 0 ? $cut.nodeBefore : $cut.nodeAfter);
	if (!$cut || !beside || !tableAtEdge(beside, side)) return false;
	const into = Selection.findFrom($cut, side, true);
	if (!into) return false;
	view.dispatch(view.state.tr.setSelection(into).scrollIntoView());
	return true;
}

export const tableArrowEntry = new Plugin({ props: { handleKeyDown: onKey } });
