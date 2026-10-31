import type { LibraryElement } from '../figure/figureLanguage';
import { sourcePoint, type Point } from '../figure/geometry';
import { snapTo } from '../figure/numbers';
import type { FigureEditorState } from '../state/editorState.svelte';
import { editEach, outermost } from '../state/selection/selectionCommands';
import { SNAP_STEP } from '../state/snapTargets';
import { elementName, groupLabel } from './libraryLabels';

/** the element added with its middle at `at` on the canvas, or the middle of the view, named for what it is, and
 *  selected */
export function insertElement(ed: FigureEditorState, element: LibraryElement, at: Point | null) {
	const before = ed.picture?.statements.length ?? 0;
	const added = ed.language.addElement(ed.source, ed.shownIndex, element);
	const picture = added === null ? null : ed.language.readPicture(added, ed.shownIndex);
	if (!added || !picture) return;
	const fresh = outermost(picture.statements.filter((s) => s.i > before));
	const [u, v] = sourcePoint(...(at ?? [ed.viewport.cx, ed.viewport.cy]), ed.placement);
	const [du, dv] = [snapTo(u, SNAP_STEP.fine), snapTo(v, SNAP_STEP.fine)];
	const placed = editEach(added, fresh, (text, st) =>
		ed.language.describe(text, st).movable ? ed.language.shiftStatement(text, st, du, dv) : null
	);
	const ids = fresh.map((s) => s.i);
	const now = ed.language.readPicture(placed, ed.shownIndex)?.statements.filter((s) => ids.includes(s.i)) ?? [];
	ed.applyEdit(
		editEach(placed, now, (text, st) => ed.language.writeLabel(text, st, element.name)),
		ids
	);
}

/** the elements whose name or group has the words in it, by group in the library's order */
export function elementGroups(elements: readonly LibraryElement[], query: string) {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const groups = new Map<string, LibraryElement[]>();
	for (const e of elements) {
		const text = `${elementName(e)} ${groupLabel(e.group)}`.toLowerCase();
		if (words.every((w) => text.includes(w))) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
	}
	return [...groups];
}

/** what a drag from the library carries onto the canvas */
export const ELEMENT_DRAG_TYPE = 'application/x-tikz-element';

/** an element dragged out of the library and let go on the canvas, its middle where it was let go */
export function dropElement(ed: FigureEditorState, e: DragEvent, surface: Element) {
	const id = e.dataTransfer?.getData(ELEMENT_DRAG_TYPE);
	const element = id ? ed.language.libraryElements.find((el) => el.id === id) : null;
	if (!element) return;
	e.preventDefault();
	const r = surface.getBoundingClientRect();
	insertElement(ed, element, ed.viewport.toPicture(e.clientX - r.left, e.clientY - r.top));
	ed.showLibrary(false);
}
