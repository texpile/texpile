// the selection a native move makes and its dispatch: Shift keeps the anchor and asks createSelectionBetween first
import { NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import { drawnWithoutContent } from '../../geometry/caretPolicy';
import { CARET_AFFINITY_META, type CaretPlace } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';

// Chromium extended a range over a chip whole and prosemirror-view read that range back as the chip selected
function drawnNodeBetween(view: VisualView, $anchor: ResolvedPos, $head: ResolvedPos): NodeSelection | null {
	const [$from, $to] = $anchor.pos <= $head.pos ? [$anchor, $head] : [$head, $anchor];
	const node = $from.nodeAfter;
	if (!node || $from.pos + node.nodeSize !== $to.pos || !NodeSelection.isSelectable(node)) return null;
	return drawnWithoutContent(view, $from.pos) ? NodeSelection.create($from.doc, $from.pos) : null;
}

/** `anchor` is where a range that grows from a selected node starts: the node's edge away from the move */
export function selectionForMove(view: VisualView, head: number, extend: boolean, anchor?: number): Selection {
	const { doc, selection } = view.state;
	const $head = doc.resolve(head);
	if (!extend) return TextSelection.create(doc, head);
	const $anchor = anchor === undefined ? selection.$anchor : doc.resolve(anchor);
	return (
		view.someProp('createSelectionBetween', (f) => f(view, $anchor, $head)) ??
		drawnNodeBetween(view, $anchor, $head) ??
		TextSelection.between($anchor, $head)
	);
}

/** the goal x and direction of an Up or Down: a formula it lands in is entered at the atom nearest that x (A5) */
export const VERTICAL_GOAL_META = 'verticalGoal';
export type VerticalGoal = { x: number; dir: -1 | 1 };

export function dispatchMove(view: VisualView, place: CaretPlace, extend: boolean, goal?: VerticalGoal, anchor?: number): void {
	const tr = view.state.tr.setSelection(selectionForMove(view, place.pos, extend, anchor)).scrollIntoView();
	if (place.affinity < 0) tr.setMeta(CARET_AFFINITY_META, -1);
	if (goal) tr.setMeta(VERTICAL_GOAL_META, goal);
	view.dispatch(tr);
}
