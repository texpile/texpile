import { canvasPoint, type Box } from '../../figure/geometry';
import type { FigureEditorState } from '../../state/editorState.svelte';
import { boundsOf } from '../partBounds';

const MIN_WIDTH_PX = 48;
// under the node, so what TeX draws of it as it is typed stays in sight
const GAP_PX = 8;

// the drawing's own parts, which a preview of the text being typed keeps numbered as they were; a node TeX has not
// drawn yet is at the point it is written at, so typing starts at once
export function editedNodeBox(ed: FigureEditorState): Box | null {
	const st = ed.selectedStatement;
	if (!ed.editingText || !st) return null;
	const parts = ed.render.drawing?.parts.filter((p) => p.stmt === st.i) ?? [];
	if (parts.length) return boundsOf(parts, (f) => ed.render.fonts.get(f)?.size ?? 10, ed.render.drawing?.clips);
	const at = ed.language.pathPoints(ed.source, st)[0];
	if (!at) return null;
	const [x, y] = canvasPoint(at.x, at.y, ed.render.transformOf(st.i));
	return { x1: x, y1: y, x2: x, y2: y };
}

/** where the text field sits on the screen, in px: its middle and its top, at least wide enough to type in */
export function nodeTextPlace(ed: FigureEditorState, box: Box | null) {
	const view = ed.viewport;
	// a branch or a cell has no point written to stand at, so it waits for TeX in the middle of the canvas
	if (!box) return ed.editingText && ed.selectedInfo?.text ? { cx: view.width / 2, top: view.height / 2, w: MIN_WIDTH_PX } : null;
	const [x1] = view.toScreen(box.x1, box.y2);
	const [x2, y2] = view.toScreen(box.x2, box.y1);
	return { cx: (x1 + x2) / 2, top: y2 + GAP_PX, w: Math.max(MIN_WIDTH_PX, x2 - x1) };
}
