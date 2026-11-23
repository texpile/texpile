// the caret engine's one entry for an arrow, plain or with Shift: the arrow keys and the platform's character and line
// keys (Ctrl+F, B, N and P on a Mac) all move through it
import { NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { CellSelection } from 'prosemirror-tables';
import { PLATFORM_RULES, currentPlatform, type Platform } from '$lib/editor/keys/platformKeys';
import type { VisualStep } from '../contracts/geometryTypes';
import type { VisualView } from '../contracts/viewTypes';
import { blockIslandOf } from '../islands/islandCode';
import { caretPolicyOf, drawnWithoutContent } from '../geometry/caretPolicy';
import { dispatchMove, VERTICAL_GOAL_META } from '../interaction/motion/extendSelection';
import { goalColumnOf } from '../interaction/motion/goalColumn';
import { blockStopFrom, selectionOfStop, stopBeyond, type BlockStop } from './blockStops';
import { EDGE, inlineStep, ownLineVertical } from './inlineStops';
import { ownLineChipOn } from './lineChips';
import { shiftInTable, tableStart, type Axis } from './tableShift';
import { verticalStop, type VerticalStop } from './verticalStops';

/** Left goes forward in a right-to-left textblock; the visual step handles a run of the other direction inside it */
export function logicalDir(view: VisualView, dir: -1 | 1): -1 | 1 {
	return view.canvas.geometry.baseDirectionAt(view.canvas.head()) === 'rtl' ? (-dir as -1 | 1) : dir;
}

function apply(view: VisualView, selection: Selection, goal?: { x: number; dir: -1 | 1 }): void {
	if (selection.eq(view.state.selection)) return;
	const tr = view.state.tr.setSelection(selection).scrollIntoView();
	if (goal) tr.setMeta(VERTICAL_GOAL_META, goal);
	view.dispatch(tr);
}

function selectStop(view: VisualView, stop: BlockStop, goal?: { x: number; dir: -1 | 1 }): void {
	apply(view, selectionOfStop(view, stop), goal);
}

/** a selected block or a gap, which a plain arrow leaves through the stream */
function onBlock(selection: Selection): boolean {
	return selection instanceof GapCursor || (selection instanceof NodeSelection && !selection.node.isInline);
}

/** Shift in a table whose anchor is in it too: the cell range, or the table taken whole; null when it stays in a cell */
function tableRange(view: VisualView, axis: Axis, dir: -1 | 1): boolean | null {
	const { selection } = view.state;
	const table = tableStart(selection.$head);
	if (table < 0 || table !== tableStart(selection.$anchor)) return null;
	const range = shiftInTable(view, table, axis, dir);
	if (!range) return null;
	apply(view, range);
	return true;
}

/** Shift from a gap: the text edge beyond it, and still one step when a chip stands there */
function rangeFromGap(view: VisualView, edge: number, dir: -1 | 1): Selection {
	const { doc } = view.state;
	const $edge = doc.resolve(edge);
	const chip = dir > 0 ? $edge.nodeAfter : $edge.nodeBefore;
	const at = dir > 0 ? edge : edge - (chip?.nodeSize ?? 0);
	const head = chip && !chip.isText && drawnWithoutContent(view, at) ? edge + dir * chip.nodeSize : edge;
	return TextSelection.create(doc, edge, head);
}

/** the step a line holding right-to-left text gives a caret or a selected inline leaf; null elsewhere */
function visualStepOf(view: VisualView, visualDir: -1 | 1, extend: boolean): VisualStep | null {
	const { selection } = view.state;
	const { geometry } = view.canvas;
	if (selection instanceof NodeSelection)
		return selection.node.isInline && !extend ? geometry.visualStep({ pos: selection.from, affinity: 1 }, visualDir, true) : null;
	if (!(selection instanceof TextSelection) || (!extend && !selection.empty)) return null;
	return geometry.visualStep(view.canvas.head(), visualDir);
}

/** true when the visual step moved the selection; the logical step enters a source chip */
function takeVisualStep(view: VisualView, step: VisualStep, extend: boolean, anchor?: number): boolean {
	if (step.kind === 'edge') return false;
	if (step.kind === 'place') {
		dispatchMove(view, step.place, extend, undefined, anchor);
		return true;
	}
	const { doc } = view.state;
	const leaf = doc.nodeAt(step.pos);
	const policy = leaf && caretPolicyOf(view, leaf);
	if (!leaf || policy === 'text' || policy === 'island') return false;
	if (!extend && policy === 'formula' && NodeSelection.isSelectable(leaf)) apply(view, NodeSelection.create(doc, step.pos));
	else dispatchMove(view, step.past, extend, undefined, anchor);
	return true;
}

/** the logical direction of the step the visual one left undone */
function logicalStepDir(view: VisualView, visual: VisualStep | null, visualDir: -1 | 1): -1 | 1 {
	if (visual?.kind === 'edge') return visual.dir;
	if (visual?.kind === 'leaf') return visual.past.pos > view.state.selection.head ? 1 : -1;
	return logicalDir(view, visualDir);
}

function horizontal(view: VisualView, visualDir: -1 | 1, extend: boolean, anchor?: number): boolean {
	const { selection } = view.state;
	const visual = visualStepOf(view, visualDir, extend);
	if (visual && takeVisualStep(view, visual, extend, anchor)) return true;
	const dir = logicalStepDir(view, visual, visualDir);
	if (extend) {
		const table = tableRange(view, 'horizontal', dir);
		if (table !== null) return table;
	}
	if (onBlock(selection)) {
		// Shift from a selected block grows a range from its edge (motion/extendFromNode); from a gap the caret goes to the
		// text beyond it, where the next Shift key starts a range
		if (extend && selection instanceof NodeSelection) return false;
		// a range from a gap with a code or raw block beside it goes into the block, where its own keys take over
		const plain = stopBeyond(view, selection, dir);
		const stop =
			extend && plain?.kind !== 'text' ? (stopBeyond(view, selection, dir, { extend }) ?? (plain?.kind === 'gap' ? null : plain)) : plain;
		if (stop && extend && stop.kind === 'text') apply(view, rangeFromGap(view, stop.pos, dir));
		else if (stop) selectStop(view, stop);
		return true;
	}
	const step = visual?.kind === 'edge' ? EDGE : inlineStep(view, dir, extend);
	if (step === null) return false;
	if (step !== EDGE) {
		// a range over a chip or a formula stays a range: no browser reads it back as the chip selected
		if (extend) apply(view, TextSelection.create(view.state.doc, anchor ?? selection.anchor, step.head));
		else apply(view, step);
		return true;
	}
	// a range in a code or raw block stays in it
	if (extend && blockIslandOf(view)) return true;
	const stop = stopBeyond(view, selection, dir, { extend });
	if (!stop) return true;
	if (extend) dispatchMove(view, { pos: stop.pos, affinity: 1 }, true, undefined, anchor);
	else selectStop(view, stop);
	return true;
}

/** a range in a code or raw block stays in it: its head stops at the block's first or last character */
function keptInIsland(view: VisualView, target: VerticalStop | null, extend: boolean): VerticalStop | null {
	const found = extend ? blockIslandOf(view) : null;
	if (!found || !target) return target;
	const from = found.start;
	const to = found.start + found.island.content.size;
	const pos = target.place?.pos ?? target.stop!.pos;
	return { place: { pos: Math.min(to, Math.max(from, pos)), affinity: 1 } };
}

function vertical(view: VisualView, dir: -1 | 1, extend: boolean, platform: Platform, rangeAnchor?: number): boolean {
	let anchor = rangeAnchor;
	const { selection } = view.state;
	if (extend) {
		if (selection instanceof NodeSelection && !selection.node.isInline) return false;
		const table = tableRange(view, 'vertical', dir);
		if (table !== null) return table;
	} else {
		const chip = ownLineVertical(view, dir);
		if (chip === EDGE) {
			const stop = stopBeyond(view, selection, dir);
			if (stop) selectStop(view, stop);
			return true;
		}
		if (chip) {
			apply(view, chip);
			return true;
		}
	}
	// a range from a gap starts at the text the head goes toward
	if (extend && selection instanceof GapCursor) anchor = blockStopFrom(view, selection.head, dir, { extend: true })?.pos ?? anchor;
	// from a gap or a selected block a plain key goes to the facing edge of the text beyond it, or the block beyond
	if (!extend && (selection instanceof GapCursor || (selection instanceof NodeSelection && !selection.node.isInline))) {
		const stop = stopBeyond(view, selection, dir);
		if (stop) selectStop(view, stop);
		return true;
	}
	const goal = goalColumnOf(view);
	const { geometry } = view.canvas;
	const head = view.canvas.head();
	const blockX = selection instanceof NodeSelection ? geometry.nodeRect(selection.from)?.rect.x : undefined;
	const x = goal.xFor(selection) ?? geometry.caretRect(head)?.x ?? blockX ?? 0;
	// a range moved by a plain Up or Down collapses at the line past its head, in text as a range's end would be
	const textOnly = extend || (selection instanceof TextSelection && !selection.empty);
	const target = keptInIsland(view, verticalStop(view, dir, x, textOnly), extend);
	if (!target) {
		// the first line going up, or the last going down: a Mac goes to its edge, Windows and Linux stay
		const line = geometry.lineOf(head);
		if (!line || !PLATFORM_RULES[platform].edgeLineGoesToEnd) return true;
		dispatchMove(view, dir < 0 ? { pos: line.from, affinity: 1 } : { pos: line.to, affinity: -1 }, extend, undefined, anchor);
		return true;
	}
	if (target.stop) {
		if (extend) dispatchMove(view, { pos: target.stop.pos, affinity: 1 }, true, { x, dir }, anchor);
		else selectStop(view, target.stop, { x, dir });
	} else {
		// a chip on a line of its own is selected whole, as a block is
		const line = extend ? null : geometry.lineOf(target.place);
		const chip = line ? ownLineChipOn(view, line) : undefined;
		if (chip !== undefined) selectStop(view, { kind: 'node', pos: chip }, { x, dir });
		else dispatchMove(view, target.place, extend, { x, dir }, anchor);
	}
	goal.keep(x, view.state.selection.head);
	return true;
}

/** true when the engine took the arrow; false leaves it to a table's cell range or a range grown from a block. `anchor`:
 *  where a range grown from a selected chip starts, its edge away from the move */
export function arrowMove(
	view: VisualView,
	axis: Axis,
	visualDir: -1 | 1,
	extend: boolean,
	platform: Platform = currentPlatform,
	anchor?: number
): boolean {
	const { selection } = view.state;
	if (selection instanceof CellSelection && !extend) return false;
	if (!(
		selection instanceof TextSelection ||
		selection instanceof NodeSelection ||
		selection instanceof GapCursor ||
		selection instanceof CellSelection
	))
		return false;
	if (axis === 'horizontal') goalColumnOf(view).reset();
	return axis === 'horizontal' ? horizontal(view, visualDir, extend, anchor) : vertical(view, visualDir, extend, platform, anchor);
}

/** a word or paragraph key passes every gap: the next stop past them, null when only gaps lie that way */
function pastGaps(view: VisualView, stop: BlockStop | null, dir: -1 | 1): BlockStop | null {
	let past = stop;
	while (past?.kind === 'gap') past = stopBeyond(view, selectionOfStop(view, past), dir);
	return past;
}

/**
 * a word or paragraph key that crosses as an arrow: from a gap or a selected block the next block or text past it, never a
 * gap; from a selected chip its edge; from a caret at its textblock's edge (its first or last line going
 * up or down) the block beyond when the stream selects it whole. False leaves the key to the word or paragraph move
 */
export function crossAsArrow(view: VisualView, axis: Axis, visualDir: -1 | 1): boolean {
	const { selection, doc } = view.state;
	const visual = axis === 'horizontal' && selection instanceof TextSelection ? visualStepOf(view, visualDir, false) : null;
	const dir = axis === 'horizontal' ? logicalStepDir(view, visual, visualDir) : visualDir;
	if (onBlock(selection)) {
		const stop = pastGaps(view, stopBeyond(view, selection, dir), dir);
		if (stop) selectStop(view, stop);
		return true;
	}
	// a word key from a selected chip goes to its edge, as from a selected word
	if (selection instanceof NodeSelection && axis === 'horizontal') {
		apply(view, TextSelection.create(doc, dir > 0 ? selection.to : selection.from));
		return true;
	}
	if (!(selection instanceof TextSelection) || !selection.empty) return false;
	const atEdge =
		axis === 'vertical' ? onEdgeLine(view, dir) : visual ? visual.kind === 'edge' : view.endOfTextblock(dir > 0 ? 'forward' : 'backward');
	if (!atEdge) return false;
	const stop = stopBeyond(view, selection, dir);
	if (stop?.kind !== 'node') return false;
	selectStop(view, stop);
	return true;
}

/** the head's line is its textblock's first (dir -1) or last (dir 1) */
function onEdgeLine(view: VisualView, dir: -1 | 1): boolean {
	const { geometry } = view.canvas;
	const line = geometry.lineOf(view.canvas.head());
	if (!line) return false;
	const next = geometry.adjacentLine(line.ref, dir);
	return !next || next.textblock !== line.ref.textblock;
}
