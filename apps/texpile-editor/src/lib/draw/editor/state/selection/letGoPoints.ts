import type { LetGoReference } from '../../figure/figureLanguage';
import { canvasPoint, sourcePoint, type Point } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';

// TikZ's compass anchors, as a way out of a node's middle
const COMPASS: Record<string, Point> = {
	north: [0, 1],
	south: [0, -1],
	east: [1, 0],
	west: [-1, 0],
	'north east': [1, 1],
	'north west': [-1, 1],
	'south east': [1, -1],
	'south west': [-1, -1]
};

function middle(ed: FigureEditorState, stmt: number) {
	const box = ed.snapBoxes.find((b) => b.stmt === stmt);
	return box ? { at: [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2] as Point, half: [(box.x2 - box.x1) / 2, (box.y2 - box.y1) / 2] } : null;
}

/** where on the canvas a name of a statement that goes is: at its anchor on its box, or where a coordinate is */
function referencePoint(ed: FigureEditorState, ref: LetGoReference): Point | null {
	const box = middle(ed, ref.stmt);
	if (!box) {
		const owner = ed.tree.byId.get(ref.stmt);
		const p = owner && ed.language.pathPoints(ed.source, owner)[0];
		return p ? canvasPoint(p.x, p.y, ed.render.transformOf(ref.stmt)) : null;
	}
	const angle = Number(ref.anchor) * (Math.PI / 180);
	const way = ref.anchor === null ? null : (COMPASS[ref.anchor] ?? (Number.isFinite(angle) ? [Math.cos(angle), Math.sin(angle)] : null));
	return way ? [box.at[0] + way[0] * box.half[0], box.at[1] + way[1] * box.half[1]] : box.at;
}

/** the statements `gone` let go of: what took a point from them or stood beside them keeps its place */
export function withReferencesLetGo(ed: FigureEditorState, gone: Set<number>) {
	return ed.language.letGoOf(
		ed.source,
		ed.shownIndex,
		[...gone],
		(st, ref) => {
			const at = referencePoint(ed, ref);
			return at && sourcePoint(at[0], at[1], ed.render.transformOf(st.i));
		},
		(st) => {
			const box = middle(ed, st.i);
			return box && sourcePoint(box.at[0], box.at[1], ed.render.outerOf(st.i));
		}
	);
}
