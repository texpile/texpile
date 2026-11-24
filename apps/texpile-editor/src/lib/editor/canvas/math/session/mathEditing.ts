// the one formula session per editor (13.6): started by the math view holding the selection, handed to the view built again
// for its formula, kept through a history step and ended when the selection leaves
import { MathfieldElement } from 'mathlive';
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { visualFind } from '$lib/editor/visual/find/visualFind.svelte';
import { MATHLIVE_PLUGIN_KEY } from '$lib/editor/visual/extensions/mathlivebridge/mlplugin';
import { installSuggestionPopoverFlashFix } from '$lib/editor/visual/extensions/mathlivebridge/suggestionPopoverFlashFix';
import { activeMath, keepsMathFocus } from '$lib/editor/visual/toolbar/activeMath.svelte';
import type { VisualView } from '../../contracts/viewTypes';
import { VERTICAL_GOAL_META, type VerticalGoal } from '../../interaction/motion/extendSelection';
import { isContextSelection } from '../../interaction/pointer/contextClick';
import type { FaceElement } from '../../tree/faceElement';
import { selectionUpdate } from '../../views/nestedEditors';
import { anchorsOf } from './mathAnchors';
import { leafMirrored } from '../../caret/mirroredLeaf';
import { CanvasMathSession, type MathEndReason, type MathEntry } from './mathSession';

/** the math view a session draws in */
export type MathHolder = {
	readonly formula: FaceElement;
	readonly session: CanvasMathSession | null;
	hold(session: CanvasMathSession | null): void;
};

let configured = false;

export function configureMathLive(): void {
	if (configured) return;
	configured = true;
	MathfieldElement.soundsDirectory = null;
	installSuggestionPopoverFlashFix();
}

class MathEditing {
	private session: CanvasMathSession | null = null;
	private holder: MathHolder | null = null;
	/** the document session.pos stands in */
	private doc: PMNode | null = null;
	/** a start a history step held back, run once the step ends its session (A8) */
	private waiting: (() => void) | null = null;

	constructor(private readonly view: VisualView) {}

	/** setSelection: the holder's session follows its node, a session its formula had in another view moves in, else one starts */
	select(holder: MathHolder, pos: number, node: PMNode): void {
		if (holder.session || this.adopt(holder, pos, node)) {
			this.follow(pos, node);
			return;
		}
		if (this.session?.holding) {
			this.waiting = () => this.select(holder, pos, node);
			return;
		}
		this.session?.end('selection');
		const update = selectionUpdate();
		if (this.mayStart(update?.tr ?? null)) this.start(holder, pos, node);
	}

	/** a view built again for the formula being edited takes over its session and draws it */
	adopt(holder: MathHolder, pos: number, node: PMNode): boolean {
		const { session } = this;
		if (!session || this.holder === holder || session.node.type !== node.type || this.posNow() !== pos) return false;
		this.holder?.hold(null);
		this.holder = holder;
		holder.hold(session);
		session.attach(holder.formula, true);
		return true;
	}

	/** where the session's formula stands in the state now, through the update being synced */
	private posNow(): number | null {
		const { session, doc } = this;
		if (!session) return null;
		if (doc === this.view.state.doc) return session.pos;
		const tr = selectionUpdate()?.tr;
		return tr && tr.before === doc ? tr.mapping.map(session.pos, 1) : null;
	}

	private follow(pos: number, node: PMNode): void {
		this.waiting = null;
		this.session?.follow(pos, node);
		this.doc = this.view.state.doc;
	}

	/** a focused editor, editable or pressed with the pointer, while find is not stepping onto the formula and a right press only selected it */
	private mayStart(tr: Transaction | null): boolean {
		const { view } = this;
		const pressed = !!tr?.getMeta('pointer');
		if (visualFind.movingSelection || isContextSelection(view)) return false;
		if (!view.editable && !pressed) return false;
		return view.hasFocus() || pressed;
	}

	private start(holder: MathHolder, pos: number, node: PMNode): void {
		const { view } = this;
		const session = new CanvasMathSession(view, pos, node, {
			leaving: (left, reason) => this.leaving(left, reason),
			ended: (ended) => this.ended(ended),
			restart: () => {
				const run = this.waiting;
				this.waiting = null;
				run?.();
			}
		});
		this.session = session;
		this.holder = holder;
		this.doc = view.state.doc;
		this.waiting = null;
		holder.hold(session);
		activeMath.current = { view, field: session.field, display: session.display, pos: () => session.pos };
		view.dom.addEventListener('contextmenu', this.contextMenu, true);
		session.attach(holder.formula);
		session.enter(this.entryOf(pos));
		view.canvas.relayout();
	}

	/** from the formula's left at its start, from its right at its end, by Up or Down at the goal x (A5) */
	private entryOf(pos: number): MathEntry {
		const update = selectionUpdate();
		const goal = update?.tr?.getMeta(VERTICAL_GOAL_META) as VerticalGoal | undefined;
		if (goal) return { kind: 'vertical', dir: goal.dir, x: goal.x };
		const { state } = this.view;
		const cameFrom = MATHLIVE_PLUGIN_KEY.getState(state)?.prevCursorPos ?? (update?.prev ?? state).selection.from;
		return { kind: cameFrom <= pos !== leafMirrored(this.view, pos) ? 'start' : 'end' };
	}

	/** null keeps the session: a history step (A8) holds it while its formula is there, the math toolbar keeps its focus */
	private leaving(session: CanvasMathSession, reason: MathEndReason): MathEndReason | null {
		if (reason === 'blur') return keepsMathFocus(this.view.dom.ownerDocument.activeElement) ? null : reason;
		if (reason !== 'selection') return reason;
		const pos = this.posNow() ?? session.pos;
		const node = this.view.state.doc.nodeAt(pos);
		if (node?.type !== session.node.type) return 'deleted';
		if (!session.holding) return reason;
		this.follow(pos, node);
		return null;
	}

	private ended(session: CanvasMathSession): void {
		if (this.session !== session) return;
		this.session = null;
		this.doc = null;
		this.holder?.hold(null);
		this.holder = null;
		if (activeMath.current?.field === session.field) activeMath.current = null;
		this.view.dom.removeEventListener('contextmenu', this.contextMenu, true);
		this.view.canvas.relayout();
	}

	/** a right click inside the entered formula: the math menu at the pointer, ahead of the editor's own */
	private contextMenu = (event: MouseEvent): void => {
		const { session } = this;
		if (!session) return;
		const box = session.formulaClientRect();
		if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) return;
		event.preventDefault();
		event.stopPropagation();
		anchorsOf(session).openMenu({ x: event.clientX, y: event.clientY });
	};
}

const editors = new WeakMap<VisualView, MathEditing>();

export function mathEditingOf(view: VisualView): MathEditing {
	let editing = editors.get(view);
	if (!editing) editors.set(view, (editing = new MathEditing(view)));
	return editing;
}
