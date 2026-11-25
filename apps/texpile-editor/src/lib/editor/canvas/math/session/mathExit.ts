// leaving a formula and emptying one (T6, T7): the caret back in the text beside it, or the empty formula gone
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { gapAwareSelectionNear } from '$lib/editor/visual/gapSelection';
import { emptyMathBlockLike } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';
import type { CaretPlace } from '../../contracts/geometryTypes';
import { blockStopFrom, selectionOfStop } from '../../caret/blockStops';
import { leafMirrored } from '../../caret/mirroredLeaf';
import { VERTICAL_GOAL_META, type VerticalGoal } from '../../interaction/motion/extendSelection';
import type { CanvasMathSession } from './mathSession';

export type MoveOutDirection = 'forward' | 'backward' | 'upward' | 'downward';

export class MathExit {
	/** empty and one Backspace pressed: tinted, the next Backspace or a leave deletes it */
	pending = false;
	/** the key MathLive is handling holds Shift: a move out of the top or bottom row ranges over the formula */
	private extending = false;

	constructor(private readonly session: CanvasMathSession) {}

	disarm(): void {
		if (!this.pending) return;
		this.pending = false;
		this.session.markPending(false);
	}

	/** an empty formula: the first press arms, the second deletes; false when it is not empty */
	private maybeDelete(dir: -1 | 1): boolean {
		if (!this.session.isEmpty()) {
			this.disarm();
			return false;
		}
		if (!this.pending) {
			this.pending = true;
			this.session.markPending(true);
			return true;
		}
		this.deleteNow(dir);
		return true;
	}

	/** the formula removed, the caret where it stood; a leave keeps the place the writer went to */
	deleteNow(dir: -1 | 1 = -1, placeCaret = true): void {
		const { view, pos } = this.session;
		// a parse that lands while the formula is edited swaps the document for an equal one
		const node = view.state.doc.nodeAt(pos);
		if (!node?.eq(this.session.node)) return;
		const tr = view.state.tr.delete(pos, pos + node.nodeSize);
		if (placeCaret) tr.setSelection(gapAwareSelectionNear(tr.doc.resolve(pos), dir)).scrollIntoView();
		view.dispatch(tr);
	}

	/** Backspace at offset 0 with nothing selected, after MathLive: an empty formula arms then goes, else the caret goes before it */
	backspaceAtStart(): boolean {
		const { field, view } = this.session;
		if (!view.editable) return false;
		const [from, to] = field.selection.ranges[0];
		if (from !== to || to !== 0) return false;
		if (!this.maybeDelete(-1)) this.land(this.session.pos, -1);
		return true;
	}

	/** MathLive's move-out */
	moveOut(direction: string): void {
		const { view, pos, node } = this.session;
		if (direction === 'backward' || direction === 'forward') {
			const dir = direction === 'forward' ? 1 : -1;
			const after = dir > 0 !== leafMirrored(view, pos);
			if (this.session.isEmpty() && !this.pending) this.maybeDelete(dir);
			this.land(after ? pos + node.nodeSize : pos, after ? 1 : -1);
		} else if (direction === 'upward' || direction === 'downward') {
			const dir = direction === 'upward' ? -1 : 1;
			if (this.extending) this.rangeOutVertically(dir);
			else this.leaveVertically(dir);
		}
	}

	/** Shift+Up or Shift+Down out of an edge row: from the text behind the formula to the text beyond it, as from a selected block */
	private rangeOutVertically(dir: -1 | 1): void {
		const { view, pos, node } = this.session;
		const { doc } = view.state;
		const near = dir > 0 ? pos + node.nodeSize : pos;
		const far = dir > 0 ? pos : pos + node.nodeSize;
		const behind = node.isBlock ? blockStopFrom(view, far, -dir as -1 | 1, { extend: true }) : null;
		const beyond = node.isBlock ? blockStopFrom(view, near, dir, { extend: true }) : null;
		const head = node.isBlock ? (beyond?.pos ?? near) : (this.lineBeyond(dir)?.pos ?? near);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, behind?.pos ?? far, head)).scrollIntoView());
	}

	/** MathLive's handling of a key, with Shift known to a move out it fires */
	handleKey(event: KeyboardEvent, handle: () => boolean): boolean {
		this.extending = event.shiftKey;
		try {
			return handle();
		} finally {
			this.extending = false;
		}
	}

	/** Escape, Enter in a one-row formula: the caret after it (A6) */
	leaveAfter(): void {
		this.land(this.session.pos + this.session.node.nodeSize, 1);
	}

	/** Shift+Left or Shift+Right at an inline formula's edge: the whole formula as a range the next Shift keys extend */
	selectOut(dir: -1 | 1): void {
		const { view, pos, node } = this.session;
		const to = pos + node.nodeSize;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, dir > 0 ? pos : to, dir > 0 ? to : pos)));
	}

	/** Shift+Enter in a display: an empty display of its kind below, entered */
	newFormulaBelow(): void {
		const { view, pos, node } = this.session;
		const at = pos + node.nodeSize;
		const tr = view.state.tr.insert(at, emptyMathBlockLike(node));
		view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
	}

	/** the caret beside an inline formula; past a display, the caret engine's next stop, never the formula selected again */
	private land(target: number, dir: -1 | 1): void {
		const { view, node } = this.session;
		const stop = node.isBlock ? blockStopFrom(view, target, dir) : null;
		const selection = stop ? selectionOfStop(view, stop) : gapAwareSelectionNear(view.state.doc.resolve(target), dir);
		view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
	}

	/** out of the top or bottom row: the line above or below at the goal x (A5), else beside the formula */
	private leaveVertically(dir: -1 | 1): void {
		const { view, pos, node } = this.session;
		if (this.enterNextDisplay(dir) || this.enterDisplayBesideLine(dir)) return;
		const place = this.lineBeyond(dir);
		if (!place) {
			this.land(dir < 0 ? pos : pos + node.nodeSize, dir);
			return;
		}
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, place.pos)).scrollIntoView());
	}

	/** a display right below or above a display is entered at its top or bottom row, at the goal x (A5) */
	private enterNextDisplay(dir: -1 | 1): boolean {
		const { view, pos, node } = this.session;
		const $edge = view.state.doc.resolve(dir < 0 ? pos : pos + node.nodeSize);
		const next = node.isBlock ? (dir < 0 ? $edge.nodeBefore : $edge.nodeAfter) : null;
		const x = this.session.goalX ?? this.session.geometry.caretBox()?.x;
		if (!next || next.type !== node.type || x === undefined) return false;
		const at = dir < 0 ? pos - next.nodeSize : pos + node.nodeSize;
		const goal: VerticalGoal = { x, dir };
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)).setMeta(VERTICAL_GOAL_META, goal).scrollIntoView());
		return true;
	}

	/** an inline formula on the first or last line of its paragraph, a display next to that paragraph: entered at the goal x */
	private enterDisplayBesideLine(dir: -1 | 1): boolean {
		const { view, pos, node } = this.session;
		if (!node.isInline) return false;
		const { geometry } = view.canvas;
		const x = this.session.goalX ?? this.session.geometry.caretBox()?.x;
		const line = geometry.lineOf({ pos, affinity: 1 });
		if (!line || x === undefined) return false;
		const lines = geometry.linesOf(line.ref.textblock);
		if (line.ref.index !== (dir < 0 ? 0 : lines.length - 1)) return false;
		const $pos = view.state.doc.resolve(pos);
		const beyond = Selection.findFrom(view.state.doc.resolve(dir < 0 ? $pos.before() : $pos.after()), dir);
		const display = beyond instanceof NodeSelection ? beyond.node : beyond?.$from.parent;
		if (!beyond || display?.type.name !== 'block_math') return false;
		const at = beyond instanceof NodeSelection ? beyond.from : beyond.$from.before();
		const goal: VerticalGoal = { x, dir };
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)).setMeta(VERTICAL_GOAL_META, goal).scrollIntoView());
		return true;
	}

	private lineBeyond(dir: -1 | 1): CaretPlace | null {
		const { view, pos, node } = this.session;
		const { geometry } = view.canvas;
		const x = this.session.goalX ?? this.session.geometry.caretBox()?.x;
		if (x === undefined) return null;
		if (node.isInline) {
			const line = geometry.lineOf({ pos, affinity: 1 });
			const next = line && geometry.adjacentLine(line.ref, dir);
			return next ? geometry.placeOnLine(next, x) : null;
		}
		const beyond = blockStopFrom(view, dir < 0 ? pos : pos + node.nodeSize, dir);
		if (beyond?.kind !== 'text') return null;
		const line = geometry.lineOf({ pos: beyond.pos, affinity: 1 });
		if (!line) return null;
		const lines = geometry.linesOf(line.ref.textblock);
		const edge = dir < 0 ? lines[lines.length - 1] : lines[0];
		return geometry.placeOnLine((edge ?? line).ref, x);
	}
}
