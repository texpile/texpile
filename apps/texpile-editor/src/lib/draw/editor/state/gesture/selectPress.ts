import type { Point } from '../../figure/geometry';
import type { FigureStatement } from '../../figure/figureLanguage';
import { clickTarget, subtree } from '../../objects/statementTree';
import type { FigureEditorState } from '../editorState.svelte';
import { chosen, movers } from '../selection/selectionCommands';
import { unionBox } from '../snapTargets';
import { hitStatement, isInSelectionBox, laidOutAt, stackedAt } from './canvasHits';
import type { GestureDrag, PressRelease } from './canvasGesture.types';

/** a move of the whole selection, or nothing when there is nothing in it the canvas may move */
function moveDrag(ed: FigureEditorState, at: Point, px: Point, lead: number, release: PressRelease, copy: boolean): GestureDrag | null {
	// a selection that is all locked stays put; anything unlocked in it takes the rest along
	if (chosen(ed).every((s) => ed.flags.lockedAll.has(s.i))) return null;
	const moved = movers(ed);
	const ref = moved.find((s) => s.i === lead) ?? moved[0];
	if (!ref) return null;
	// what is inside a mover goes with it, an axis' plots included, though only the mover is written
	const ids = [...new Set(moved.flatMap((s) => subtree(ed.tree, s.i)))];
	function own(s: FigureStatement) {
		return ed.language.pathPoints(ed.source, s).filter((p) => !p.relative);
	}
	// a path drawn through named points snaps by the first of them
	const first = [ref, ...moved].find((s) => own(s).length) ?? ref;
	return {
		kind: 'move',
		ids,
		start: at,
		startPx: px,
		m: ed.render.transformOf(first.i),
		points: own(first),
		delta: [0, 0],
		box: unionBox(ed.snapBoxes.filter((b) => ids.includes(b.stmt))),
		release,
		moving: false,
		copy
	};
}

/** a press of the select tool off every handle: what it selects now, and the drag it starts, as Excalidraw's does */
export function pressToSelect(ed: FigureEditorState, e: PointerEvent, at: Point, px: Point): GestureDrag | null {
	const under = hitStatement(ed, e.target as Element | null);
	const hit = under.i || (under.locked ? 0 : (laidOutAt(ed, at)?.stmt ?? 0));
	const deep = e.ctrlKey || e.metaKey;
	const inBox = !deep && isInSelectionBox(ed, at);
	if (!hit) {
		// inside the selection's box a press drags it, and a click there lets it go
		if (inBox) return moveDrag(ed, at, px, ed.selected, { kind: 'clear' }, e.altKey);
		if (!e.shiftKey) ed.select(0);
		return { kind: 'marquee', start: at, startPx: px, base: ed.selection, locked: under.locked };
	}
	// Ctrl reaches past the scopes to the shape itself; a tree's branches are its nodes, not groups
	const i = deep || ed.picture?.layout === 'tree' ? hit : clickTarget(ed.tree, hit, ed.selection);
	const isSelected = ed.selection.some((s) => subtree(ed.tree, s).includes(i));
	let release: PressRelease = { kind: 'keep' };
	// Alt and a click picks the next shape down under the pointer
	const stack = e.altKey && ed.selection.length === 1 ? stackedAt(ed, e.clientX, e.clientY) : [];
	const below = stack.indexOf(ed.selected);
	// a press in the selection's box drags it, even under another shape; a click there takes that shape
	if (below >= 0 && stack.length > 1) release = { kind: 'only', i: stack[(below + 1) % stack.length] };
	else if (!isSelected && inBox && !e.shiftKey) release = { kind: 'only', i };
	else if (e.shiftKey) {
		if (isSelected) release = { kind: 'remove', i };
		else ed.selectMany([...ed.selection, i], i);
	} else if (!isSelected) ed.select(i);
	else if (ed.selection.length > 1) release = { kind: 'only', i };
	if (ed.tree.byId.get(i)?.kind === 'branch' && ed.tree.parent.get(i) && ed.selection.length === 1)
		return { kind: 'branch', i, start: at, ids: subtree(ed.tree, i) };
	const cell = ed.tree.byId.get(i)?.kind === 'cell' && ed.selection.length === 1 ? ed.snapBoxes.find((b) => b.stmt === i) : null;
	if (cell) return { kind: 'cell', i, start: at, middle: [(cell.x1 + cell.x2) / 2, (cell.y1 + cell.y2) / 2] };
	return moveDrag(ed, at, px, hit, release, e.altKey);
}
