// Backspace and Delete after captureKeys declined: what Chromium deleted inside the textblock, as readDOMChange read it back
import { TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import type { CanvasGeometry } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { drawnWithoutContent } from '../../geometry/caretPolicy';
import { backspaceStart } from '../../layout/text/graphemes';

/** paragraph deletes to the start of the textblock, paragraphEnd to its end */
export type DeleteGranularity = 'character' | 'word' | 'lineBoundary' | 'paragraph' | 'paragraphEnd';

function reachOf(
	state: EditorState,
	geometry: CanvasGeometry,
	stops: readonly number[],
	dir: -1 | 1,
	by: DeleteGranularity
): number | undefined {
	const { $head, head } = state.selection;
	if (by === 'word') return geometry.wordBoundary({ pos: head, affinity: 1 }, dir, dir < 0 ? 'previousStart' : 'nextEnd');
	if (by === 'lineBoundary') {
		const line = geometry.lineOf({ pos: head, affinity: 1 });
		return line ? (dir < 0 ? line.from : line.to) : undefined;
	}
	if (by === 'paragraph' || by === 'paragraphEnd') return dir < 0 ? $head.start() : $head.end();
	if (dir < 0) return backspaceReach(state) ?? stops.findLast((stop) => stop < head);
	return stops.find((stop) => stop > head);
}

/** Backspace takes one code point, or a whole emoji, flag or keycap sequence, as Chromium's backspace state machine does */
function backspaceReach(state: EditorState): number | undefined {
	const { $head, head } = state.selection;
	const node = $head.textOffset ? $head.parent.child($head.index()) : $head.nodeBefore;
	if (!node?.isText) return undefined;
	const offset = $head.textOffset || node.nodeSize;
	return head - (offset - backspaceStart(node.text!, offset));
}

/** the end of a deletion from the head: one caret stop or one word, over text and drawn atoms, never past the textblock */
function deletionEnd(view: VisualView, dir: -1 | 1, by: DeleteGranularity): number | null {
	const { state } = view;
	const { geometry } = view.canvas;
	const { $head, head } = state.selection;
	const stops = geometry.stopsOf($head.before()).positions;
	const reach = reachOf(state, geometry, stops, dir, by);
	if (reach === undefined || reach === head) return null;
	let end = head;
	while (end !== reach) {
		const $end = state.doc.resolve(end);
		const node = dir > 0 ? $end.nodeAfter : $end.nodeBefore;
		if (!node || $end.parent !== $head.parent) break;
		if (node.isText) end += dir * Math.min(Math.abs(reach - end), node.nodeSize);
		else if (drawnWithoutContent(view, dir > 0 ? end : end - node.nodeSize)) end += dir * node.nodeSize;
		else break;
	}
	return end === head ? null : end;
}

/** `within`: the island the caret is in, whose edges a deletion stops at */
export function nativeDeleteTr(
	view: VisualView,
	dir: -1 | 1,
	by: DeleteGranularity,
	within: { readonly from: number; readonly to: number } | null = null
): Transaction | null {
	const { state } = view;
	const { selection, doc } = state;
	if (!selection.empty) return state.tr.deleteSelection();
	if (!(selection instanceof TextSelection) || !selection.$head.parent.inlineContent) return null;
	const found = deletionEnd(view, dir, by);
	const end = found === null || !within ? found : Math.min(within.to, Math.max(within.from, found));
	if (end === null || end === selection.head) return null;
	const [from, to] = dir < 0 ? [end, selection.head] : [selection.head, end];
	const marks = doc.resolve(from).marksAcross(doc.resolve(to));
	const tr = state.tr.delete(from, to);
	if (marks) tr.ensureMarks(marks);
	return tr;
}
