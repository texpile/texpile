import type { Point } from '../../../figure/geometry';
import { freePlaceNear, type GridPlace } from '../../../diagrams/slotPlaces';
import type { FigureEditorState } from '../../editorState.svelte';
import type { BranchDrag, CellDrag, GestureOffset } from '../canvasGesture.types';
import { laidOutAt } from '../canvasHits';

/** how far a carried branch has gone, and the tree node it would go under */
export function carriedBranch(ed: FigureEditorState, drag: BranchDrag, at: Point) {
	const onto = laidOutAt(ed, at, drag.ids);
	const by: Point = [at[0] - drag.start[0], at[1] - drag.start[1]];
	return { by, onto: onto && ed.tree.byId.get(onto.stmt)?.kind === 'branch' ? onto : null };
}

/** how far a carried cell has gone, and the free place it would land in */
export function carriedCell(ed: FigureEditorState, drag: CellDrag, at: Point) {
	const by: Point = [at[0] - drag.start[0], at[1] - drag.start[1]];
	const to = freePlaceNear(ed.diagram.places, [drag.middle[0] + by[0], drag.middle[1] + by[1]], ed.diagram.step * 0.75);
	return { by, to };
}

/** the cell moved to its place, and shown there until TeX draws it; the drawing on screen still numbers it as before */
export function landCell(ed: FigureEditorState, drag: CellDrag, to: GridPlace): GestureOffset {
	ed.diagram.move(drag.i, to);
	return { ids: [drag.i], by: [to.at[0] - drag.middle[0], to.at[1] - drag.middle[1]], until: ed.render.requested };
}
