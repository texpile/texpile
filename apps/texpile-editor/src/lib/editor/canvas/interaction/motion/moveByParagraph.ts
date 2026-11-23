// Ctrl+Up and Ctrl+Down as Chromium's paragraph moves: line by line at the goal x until the textblock changes
import type { CaretPlace, LineRef } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import type { GoalColumn } from './goalColumn';

/** `select`: a chip on a line of its own the move comes to, which it selects whole */
export type VerticalTarget = { place: CaretPlace; x: number; select?: number };

export function paragraphTarget(
	view: VisualView,
	goal: GoalColumn,
	dir: -1 | 1,
	head: CaretPlace = view.canvas.head()
): VerticalTarget | null {
	const { geometry } = view.canvas;
	const line = geometry.lineOf(head);
	if (!line) return null;
	const x = goal.xFor(view.state.selection) ?? geometry.caretRect(head)?.x ?? line.left;
	for (let ref: LineRef | null = line.ref; ref;) {
		const next = geometry.adjacentLine(ref, dir);
		if (next && next.textblock !== line.ref.textblock) return { place: geometry.placeOnLine(next, x), x };
		if (!next) {
			const edge = geometry.linesOf(line.ref.textblock).at(dir < 0 ? 0 : -1);
			return edge ? { place: dir < 0 ? { pos: edge.from, affinity: 1 } : { pos: edge.to, affinity: -1 }, x } : null;
		}
		ref = next;
	}
	return null;
}
