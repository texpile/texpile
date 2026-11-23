// the platform table's intent carried out on the canvas, where Chromium would have moved or deleted natively (10.3)
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { KeyIntent, Platform } from '$lib/editor/keys/platformKeys';
import type { CaretPlace } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { nativeDeleteTr, type DeleteGranularity } from '../editing/nativeDelete';
import { killTr, yankTr, type KillRing } from '../editing/killRing';
import { openLineTr } from '../editing/openLine';
import { blockIslandOf } from '../../islands/islandCode';
import { transposeTr } from '../editing/transpose';
import { caretEdgeFrom } from '../motion/caretTextblocks';
import { dispatchMove } from '../motion/extendSelection';
import { startFromNode } from '../motion/extendFromNode';
import type { GoalColumn } from '../motion/goalColumn';
import { lineBoundaryTarget } from '../motion/moveByLine';
import { movePage, scrollPage } from '../motion/moveByPage';
import { wordTarget } from '../motion/moveByWord';
import { paragraphTarget, type VerticalTarget } from '../motion/moveByParagraph';
import { arrowMove, crossAsArrow, logicalDir } from '../../caret/caretMoves';

type MoveIntent = Extract<KeyIntent, { kind: 'move' }>;
type DeleteIntent = Extract<KeyIntent, { kind: 'delete' }>;

export type NativeKeyState = { readonly goal: GoalColumn; readonly ring: KillRing; readonly platform: Platform };

type IslandBounds = { readonly from: number; readonly to: number };

/** the code or raw block holding the selection, whose moves stay in it as its CodeMirror kept them; a plain arrow and Ctrl+Up or Down leave it */
function islandBounds(view: VisualView, intent: MoveIntent | DeleteIntent): IslandBounds | null {
	if (intent.kind === 'move' && !intent.extend && (intent.by === 'character' || intent.by === 'line' || intent.by === 'paragraph'))
		return null;
	const found = blockIslandOf(view);
	return found && { from: found.start, to: found.start + found.island.content.size };
}

function within(place: CaretPlace, bounds: IslandBounds | null): CaretPlace {
	return bounds ? { ...place, pos: Math.min(bounds.to, Math.max(bounds.from, place.pos)) } : place;
}

function documentEdge(view: VisualView, dir: -1 | 1, extend: boolean): CaretPlace | null {
	const pos = caretEdgeFrom(view, dir < 0 ? 0 : view.state.doc.content.size, -dir as -1 | 1, extend);
	return pos === null ? null : { pos, affinity: 1 };
}

function columnTarget(view: VisualView, intent: MoveIntent, state: NativeKeyState, from: CaretPlace): VerticalTarget | null {
	return paragraphTarget(view, state.goal, intent.dir, from);
}

/** from a gap cursor the move starts at the facing edge of the text beyond it; Shift keeps that edge as the anchor */
function leaveGap(view: VisualView, gap: GapCursor, intent: MoveIntent, state: NativeKeyState): void {
	const pos = caretEdgeFrom(view, gap.head, intent.dir);
	if (pos === null) return;
	const target = intent.extend ? columnTarget(view, intent, state, { pos, affinity: 1 }) : null;
	if (target) dispatchMove(view, target.place, true, undefined, pos);
	else view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).scrollIntoView());
}

function runColumnMove(view: VisualView, intent: MoveIntent, state: NativeKeyState, anchor: number | undefined): void {
	if (view.state.selection instanceof GapCursor) return leaveGap(view, view.state.selection, intent, state);
	// Chromium moves a range's line from its focus, as P0 did, Shift or not
	const target = columnTarget(view, intent, state, view.canvas.head());
	if (!target) return;
	const bounds = islandBounds(view, intent);
	if (target.select !== undefined && !intent.extend && !bounds) {
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, target.select)).scrollIntoView());
		state.goal.keep(target.x, view.state.selection.head);
		return;
	}
	dispatchMove(
		view,
		within(target.place, bounds),
		intent.extend,
		intent.by === 'line' ? { x: target.x, dir: intent.dir } : undefined,
		anchor
	);
	state.goal.keep(target.x, view.state.selection.head);
}

/** a Shift word move beside a leaf (a citation) ranges over it whole and stays a range, as a Shift arrow does */
function overLeaf(view: VisualView, visualDir: -1 | 1, anchor: number | undefined): boolean {
	const { selection, doc } = view.state;
	if (!(selection instanceof TextSelection)) return false;
	const dir = logicalDir(view, visualDir);
	const { $head } = selection;
	const leaf = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
	if (!leaf || leaf.isText || !leaf.isLeaf) return false;
	const head = $head.pos + dir * leaf.nodeSize;
	view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, anchor ?? selection.anchor, head)).scrollIntoView());
	return true;
}

function runPlaceMove(view: VisualView, intent: MoveIntent, state: NativeKeyState, anchor: number | undefined): void {
	const { dir, extend } = intent;
	state.goal.reset();
	if (intent.by === 'word' && extend && overLeaf(view, dir, anchor)) return;
	const target =
		intent.by === 'word'
			? wordTarget(view, dir, state.platform, extend)
			: intent.by === 'lineBoundary'
				? lineBoundaryTarget(view, dir)
				: documentEdge(view, dir, extend);
	if (target) dispatchMove(view, within(target, islandBounds(view, intent)), extend, undefined, anchor);
}

function runMove(view: VisualView, intent: MoveIntent, state: NativeKeyState): void {
	const start = intent.extend ? startFromNode(view, intent.dir) : null;
	if (start?.head != null) dispatchMove(view, { pos: start.head, affinity: 1 }, true, undefined, start.anchor);
	else if (intent.by === 'page') movePage(view, state.goal, intent.dir, intent.extend);
	// a character or a line is the caret engine's, as the arrow keys are
	else if (intent.by === 'character') arrowMove(view, 'horizontal', intent.dir, intent.extend, state.platform, start?.anchor);
	else if (intent.by === 'line') arrowMove(view, 'vertical', intent.dir, intent.extend, state.platform, start?.anchor);
	// a word or paragraph key on a gap or a selected block, or at a textblock's edge before an atom, crosses as an arrow
	else if (!intent.extend && intent.by === 'word' && crossAsArrow(view, 'horizontal', intent.dir)) return;
	else if (!intent.extend && intent.by === 'paragraph' && crossAsArrow(view, 'vertical', intent.dir)) return;
	// Shift and a word key from a gap leave it as the plain key does, never onto another gap
	else if (intent.extend && intent.by === 'word' && view.state.selection instanceof GapCursor) crossAsArrow(view, 'horizontal', intent.dir);
	else if (intent.by === 'paragraph') runColumnMove(view, intent, state, start?.anchor);
	else runPlaceMove(view, intent, state, start?.anchor);
}

function runDelete(view: VisualView, intent: DeleteIntent): boolean {
	const by = intent.by as DeleteGranularity;
	const tr = nativeDeleteTr(view, intent.dir, by, islandBounds(view, intent));
	if (tr) view.dispatch(tr.scrollIntoView());
	return true;
}

function runEdit(view: VisualView, intent: KeyIntent, state: NativeKeyState): boolean {
	const tr =
		intent.kind === 'kill'
			? killTr(view.state, view.canvas.geometry, state.ring)
			: intent.kind === 'yank'
				? yankTr(view.state, state.ring)
				: intent.kind === 'transpose'
					? transposeTr(view.state, view.canvas.geometry)
					: openLineTr(view.state);
	if (tr) view.dispatch(tr.scrollIntoView());
	return true;
}

/** true when the intent is the canvas's to carry out; a key it leaves (the clipboard keys) goes on */
export function runKeyIntent(view: VisualView, intent: KeyIntent, state: NativeKeyState): boolean {
	if (intent.kind !== 'kill') state.ring.close();
	if (intent.kind === 'move') {
		runMove(view, intent, state);
		return true;
	}
	state.goal.reset();
	if (intent.kind === 'scroll') {
		scrollPage(view, intent.to);
		return true;
	}
	if (intent.kind === 'delete')
		return intent.by === 'document' || intent.by === 'page' || intent.by === 'line' ? false : runDelete(view, intent);
	if (intent.kind === 'clipboard') return false;
	return runEdit(view, intent, state);
}
