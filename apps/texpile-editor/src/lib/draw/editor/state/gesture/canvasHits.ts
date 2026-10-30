import type { Point } from '../../figure/geometry';
import { subtree } from '../../objects/statementTree';
import type { FigureEditorState } from '../editorState.svelte';
import { unionBox } from '../snapTargets';

// a selected shape takes a press anywhere in its box this far out, a selection of several this far out of all of them
const SELECTED_REACH_PX = 11;
const SELECTION_REACH_PX = 12;

/** the drawn statement under the pointer, and whether it is locked; a drawing older than the text numbers its
 *  statements differently, so it is not picked from until it catches up. Capture sends a click to the canvas, so
 *  that asks the page */
export function hitStatement(ed: FigureEditorState, under: Element | null) {
	const el = ed.drawingMatchesText ? under?.closest('[data-stmt], [data-reach]') : null;
	const i = el ? Number(el.getAttribute('data-stmt') ?? el.getAttribute('data-reach')) : 0;
	if (!ed.tree.byId.get(i) || ed.tree.byId.get(i)!.kind === 'frame') return { i: 0, locked: 0 };
	// a locked shape on top takes the press and does nothing with it, as the empty canvas would
	return ed.flags.lockedAll.has(i) ? { i: 0, locked: i } : { i, locked: 0 };
}

/** the statements drawn under a page point, the top one first */
export function stackedAt(ed: FigureEditorState, x: number, y: number) {
	const ids = document.elementsFromPoint(x, y).map((el) => hitStatement(ed, el).i);
	return [...new Set(ids.filter((i) => i))];
}

/** a diagram's cell or a tree's node is a few letters: anywhere in its box takes it, the smallest box first */
export function laidOutAt(ed: FigureEditorState, [x, y]: Point, exclude: number[] = []) {
	if (!ed.picture?.layout || !ed.drawingMatchesText) return null;
	const pad = 3 / ed.viewport.scale;
	const kinds = new Set(['cell', 'branch']);
	const inside = ed.snapBoxes.filter(
		(b) =>
			kinds.has(ed.tree.byId.get(b.stmt)?.kind ?? '') &&
			!exclude.includes(b.stmt) &&
			!ed.flags.lockedAll.has(b.stmt) &&
			b.x1 - pad <= x &&
			x <= b.x2 + pad &&
			b.y1 - pad <= y &&
			y <= b.y2 + pad
	);
	return inside.sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1))[0] ?? null;
}

/** one open line from point to point is selected, which has its two ends and no box, as in Excalidraw */
export function isBareLine(ed: FigureEditorState) {
	if (ed.selection.length !== 1 || ed.selectedStatement?.kind === 'node') return false;
	if (ed.handles.filter((h) => h.key[0] === 'p' || h.key[0] === 'e').length !== 2) return false;
	const parts = ed.render.drawing?.parts.filter((p) => p.stmt === ed.selected) ?? [];
	return !parts.some((p) => p.kind !== 'path' || p.fill || /Z/i.test(p.d));
}

/** true when `at` is inside the box around the selection, where a press drags it rather than picking anew */
export function isInSelectionBox(ed: FigureEditorState, [x, y]: Point) {
	if (!ed.selection.length || !ed.drawingMatchesText || isBareLine(ed)) return false;
	const inside = new Set(ed.selection.flatMap((i) => subtree(ed.tree, i)));
	const box = unionBox(ed.snapBoxes.filter((b) => inside.has(b.stmt)));
	if (!box) return false;
	const pad = (ed.selection.length > 1 ? SELECTION_REACH_PX : SELECTED_REACH_PX) / ed.viewport.scale;
	return box.x1 - pad <= x && x <= box.x2 + pad && box.y1 - pad <= y && y <= box.y2 + pad;
}
