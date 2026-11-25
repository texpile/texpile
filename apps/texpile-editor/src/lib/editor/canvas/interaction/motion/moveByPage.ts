// PageUp and PageDown as P0 recorded them (pointer/ pageKeys): the caret moves 0.93 of the pane's height, the pane scrolls 0.875 of it
import { CARET_AFFINITY_META, PAGE_KEY_META } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { selectionForMove } from './extendSelection';
import type { GoalColumn } from './goalColumn';
import type { VerticalTarget } from './moveByParagraph';

const SCROLL_STEP = 0.875;
const CARET_STEP = 0.93;

/** doc px of a share of the pane's height */
function paneShare(view: VisualView, share: number): number {
	return view.canvas.docPoint({ x: 0, y: view.canvas.scroller.clientHeight * share }).y - view.canvas.docPoint({ x: 0, y: 0 }).y;
}

export function pageTarget(view: VisualView, goal: GoalColumn, dir: -1 | 1): VerticalTarget | null {
	const { geometry } = view.canvas;
	const caret = geometry.caretRect(view.canvas.head());
	if (!caret) return null;
	const x = goal.xFor(view.state.selection) ?? caret.x;
	const place = geometry.placeAt({ x, y: caret.y + caret.height / 2 + dir * paneShare(view, CARET_STEP) });
	return place && { place, x };
}

/** the caret to the page's line; the pane puts it at the band's top, or with Shift shows it at the nearest edge. A caret that cannot move scrolls the pane a page */
export function movePage(view: VisualView, goal: GoalColumn, dir: -1 | 1, extend: boolean): void {
	const target = pageTarget(view, goal, dir);
	const { head } = view.state.selection;
	if (!target) return;
	const selection = selectionForMove(view, target.place.pos, extend);
	if (selection.head === head) {
		const { scroller } = view.canvas;
		scroller.scrollTop += dir * scroller.clientHeight * SCROLL_STEP;
		return;
	}
	const tr = view.state.tr.setSelection(selection).setMeta(PAGE_KEY_META, true);
	if (target.place.affinity < 0) tr.setMeta(CARET_AFFINITY_META, -1);
	view.dispatch(tr);
	goal.keep(target.x, view.state.selection.head);
	view.canvas.revealPos(view.state.selection.head, extend ? 'nearest' : 'start');
}

/** macOS's PageUp, PageDown, Home and End move the view and leave the caret */
export function scrollPage(view: VisualView, to: 'start' | 'end' | 'pageUp' | 'pageDown'): void {
	const { scroller } = view.canvas;
	if (to === 'start') scroller.scrollTop = 0;
	else if (to === 'end') scroller.scrollTop = scroller.scrollHeight;
	else scroller.scrollTop += (to === 'pageDown' ? 1 : -1) * scroller.clientHeight * SCROLL_STEP;
}
