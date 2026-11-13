// Up or Down out of a table's first or last row stops on the gap beside the table where no text stands there,
// from any cell of the row. The table plugin's own arrows go on to the nearest text, past the gap
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { textBeside } from '$lib/editor/visual/gapArrows';
import { gapCursorAt } from '$lib/editor/visual/gapSelection';

function onKey(view: EditorView, event: KeyboardEvent): boolean {
	const dir = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
	if (!dir || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
	const { selection, doc } = view.state;
	if (!(selection instanceof TextSelection) || !selection.empty) return false;
	const { $head } = selection;
	let depth = $head.depth;
	while (depth > 0 && $head.node(depth).type.spec.tableRole !== 'table') depth--;
	if (!depth) return false;
	// the row is the table's last (first), and so is every block in the cell down to the caret's line
	for (let d = depth; d < $head.depth; d++)
		if (d !== depth + 1 && $head.index(d) !== (dir > 0 ? $head.node(d).childCount - 1 : 0)) return false;
	if (!view.endOfTextblock(dir > 0 ? 'down' : 'up')) return false;
	let $edge = doc.resolve(dir > 0 ? $head.after(depth) : $head.before(depth));
	while ($edge.depth > 0 && !$edge.parent.type.spec.isolating && $edge.index() === (dir > 0 ? $edge.parent.childCount : 0))
		$edge = doc.resolve(dir > 0 ? $edge.after() : $edge.before());
	const gap = gapCursorAt($edge);
	if (!gap || textBeside($edge, dir)) return false;
	view.dispatch(view.state.tr.setSelection(gap).scrollIntoView());
	return true;
}

export const tableArrowExit = new Plugin({ props: { handleKeyDown: onKey } });
