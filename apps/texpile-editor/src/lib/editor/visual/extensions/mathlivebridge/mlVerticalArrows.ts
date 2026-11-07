// Up and Down in and around paragraphs that hold inline math
import { Selection, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { posOneLineAway, posOnEdgeLine } from '$lib/editor/visual/caretLines';

// The browser's own vertical move loses its way next to the math widgets (it slides sideways or
// sticks), so there the caret is placed by hand. The browser keeps its column only across its own
// moves and a placed caret resets it, so the column is kept here, across both kinds of move.
type GoalColumn = { x: number; head: number };
type VerticalMoves = { goal: GoalColumn | null; browserMoves: number; placedLast: boolean; placing: boolean };

const movesByView = new WeakMap<EditorView, VerticalMoves>();

function movesOf(view: EditorView): VerticalMoves {
	let moves = movesByView.get(view);
	if (!moves) movesByView.set(view, (moves = { goal: null, browserMoves: 0, placedLast: false, placing: false }));
	return moves;
}

function holdsMath(block: PMNode): boolean {
	let found = false;
	block.forEach((child) => {
		if (child.type.name === 'inline_math') found = true;
	});
	return found;
}

/** where a placed move lands, or null when the move is the browser's to make */
function placedSelection(view: EditorView, dir: -1 | 1, x: number, offColumn: boolean): Selection | null {
	const { doc, selection } = view.state;
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const $head = selection.$head;
	if (!$head.parent.isTextblock) return null;
	const next = Selection.findFrom(doc.resolve(dir < 0 ? $head.before() : $head.after()), dir);
	const nextBlock = next instanceof TextSelection ? next.$head.parent : null;
	// a plain paragraph is the browser's, all but its step into a paragraph with math
	const onlyItsEdge = !holdsMath($head.parent) && !offColumn;
	if (onlyItsEdge && !(nextBlock && holdsMath(nextBlock))) return null;

	const inside = posOneLineAway(view, $head.before(), $head.pos, dir, x);
	if (inside !== null) return onlyItsEdge ? null : TextSelection.create(doc, inside);
	// as browsers do at either end of a document
	if (!next) return TextSelection.create(doc, dir < 0 ? $head.start() : $head.end());
	if (!(next instanceof TextSelection) || next.$head.parent.type.spec.code) return next;
	const entered = posOnEdgeLine(view, next.$head.before(), dir, x);
	return entered === null ? next : TextSelection.create(doc, entered);
}

export function verticalArrowKeyDown(view: EditorView, event: KeyboardEvent): boolean {
	const moves = movesOf(view);
	const up = event.key === 'ArrowUp';
	if ((!up && event.key !== 'ArrowDown') || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
		moves.browserMoves = 0;
		return false;
	}
	const head = view.state.selection.head;
	const caretX = view.coordsAtPos(head, 1).left;
	const x = moves.goal?.head === head ? moves.goal.x : caretX;
	const placed = placedSelection(view, up ? -1 : 1, x, moves.placedLast && Math.abs(caretX - x) > 3);
	if (!placed) {
		moves.goal = { x, head };
		moves.browserMoves++;
		return false;
	}
	moves.placing = true;
	view.dispatch(view.state.tr.setSelection(placed).scrollIntoView());
	moves.placing = false;
	moves.goal = { x, head: view.state.selection.head };
	moves.browserMoves = 0;
	moves.placedLast = true;
	return true;
}

export function moveOneLine(view: EditorView, dir: -1 | 1): void {
	const x = view.coordsAtPos(view.state.selection.head, 1).left;
	const placed = placedSelection(view, dir, x, false);
	if (placed) view.dispatch(view.state.tr.setSelection(placed).scrollIntoView());
}

export function verticalArrowsMouseDown(view: EditorView): boolean {
	const moves = movesOf(view);
	moves.goal = null;
	moves.browserMoves = 0;
	return false;
}

/** after every state update: a selection the browser moved keeps the column, any other change drops it */
export function verticalArrowsAfterUpdate(view: EditorView, selectionMoved: boolean): void {
	const moves = movesOf(view);
	if (moves.placing || !selectionMoved) return;
	if (moves.browserMoves > 0 && moves.goal) {
		moves.browserMoves--;
		moves.goal = { x: moves.goal.x, head: view.state.selection.head };
	} else moves.goal = null;
	moves.placedLast = false;
}
