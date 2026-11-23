// the pointer machine (11.6): prosemirror-view's click order over canvas hits
import { NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { isMac } from '$lib/platform';
import type { CanvasPointerEvent, FaceDrag } from '../../contracts/faceTypes';
import { CARET_AFFINITY_META, type CanvasHit, type CaretPlace } from '../../contracts/geometryTypes';
import type { ViewInputFacts, VisualView } from '../../contracts/viewTypes';
import type { FaceElement } from '../../tree/faceElement';
import { Autoscroll, POINTER_DRAG_META, type ScrollTarget } from './autoscroll';
import { ClickCounter, type ClickKind } from './clickCounter';
import {
	defaultTripleClick,
	handleDoubleClick,
	handleSingleClick,
	handleTripleClick,
	selectionForTripleClick,
	updateSelection
} from './clickRules';
import { contextClickPlan, markContextSelection } from './contextClick';
import { runFaceHandlers, viewsStopEvent } from './faceHandlers';
import { beforeCellStart, dragHead } from './dragHeads';

export type { ClickKind } from './clickCounter';
export { ClickCounter } from './clickCounter';

export type PressState =
	| { kind: 'idle' }
	| {
			kind: 'pressed';
			button: number;
			client: { x: number; y: number };
			hit: CanvasHit;
			click: ClickKind;
			selectNode: boolean;
			allowDefault: boolean;
			mightDrag: { node: PMNode; pos: number } | null;
			/** inside a text selection: a move past the threshold drags the selection, as a native drag */
			inRange: boolean;
			startDoc: PMNode;
	  }
	| { kind: 'selecting'; by: 'character' | 'word' | 'paragraph'; anchor: CaretPlace; anchorRange: { from: number; to: number } }
	// prosemirror-tables' cell drag owns the moves (view.root)
	| { kind: 'library' }
	// a face handler captured the pointer (resize handles, column edges)
	| { kind: 'face'; owner: FaceElement }
	// forwarded to MathLive's pointer tracker (13.8)
	| { kind: 'formula' }
	// Alt-drag in code blocks
	| { kind: 'island'; rectangular: boolean }
	| { kind: 'nativeDrag' };

export type PointerHooks = {
	/** the press retargeted to the hit's element (2.3) */
	retarget(event: MouseEvent, hit: CanvasHit): CanvasPointerEvent;
	/** handleDOMEvents.mousedown: true when a handler took the press or prevented it */
	mousedown(event: CanvasPointerEvent): boolean;
	/** a press ends a composition first (forceDOMFlush) */
	endComposition(): void;
	/** what a drag past an edge scrolls: the page's scroller, regions that scroll sideways */
	scrollTargets?(): readonly ScrollTarget[];
	/** the drag's move again after an autoscroll step, through every listener a real move reaches */
	replay?(point: { x: number; y: number }): void;
};

type InputFactsRecord = { -readonly [K in keyof ViewInputFacts]: ViewInputFacts[K] };

const DRAG_PX = 4;
const CLICK_TYPES: Record<ClickKind, string> = { single: 'singleClick', double: 'doubleClick', triple: 'tripleClick' };

function caretTr(view: VisualView, selection: Selection, head: CaretPlace) {
	const tr = view.state.tr.setSelection(selection).setMeta('pointer', true);
	return head.affinity < 0 ? tr.setMeta(CARET_AFFINITY_META, -1) : tr;
}

/** click props get the event retargeted as prosemirror-view's got the DOM's: proofread places its box by event.target (2.3) */
function asMouseEvent(event: CanvasPointerEvent): MouseEvent {
	return event as unknown as MouseEvent;
}

/** a leaf the press lands on: the caret waits for the release, which selects it */
function onLeaf(hit: CanvasHit): boolean {
	const target = hit.target.kind === 'cell' ? hit.target.inner : hit.target;
	return target.kind === 'formula' || (target.kind === 'leaf' && target.policy !== 'text' && target.policy !== 'island');
}

export class PointerMachine {
	state: PressState = { kind: 'idle' };
	private readonly clicks = new ClickCounter();
	private faceDrag: FaceDrag | null = null;
	/** the single press placed no caret yet (a leaf, a range it may drag): the release places it */
	private caretOwed = false;
	/** the right press kept the selection or selected an atom: the release runs no click handler on it */
	private contextHandled = false;
	private readonly autoscroll: Autoscroll;

	constructor(
		private readonly view: VisualView,
		private readonly hooks: PointerHooks,
		private readonly mac = isMac
	) {
		this.autoscroll = new Autoscroll({
			targets: () => hooks.scrollTargets?.() ?? [],
			rerun: (point) =>
				hooks.replay ? hooks.replay(point) : this.move(new MouseEvent('mousemove', { clientX: point.x, clientY: point.y, buttons: 1 }))
		});
	}

	private hitAt(event: MouseEvent): CanvasHit | null {
		const { canvas } = this.view;
		return canvas.geometry.hit(canvas.docPoint({ x: event.clientX, y: event.clientY }));
	}

	/** true when the default is to be prevented */
	press(event: MouseEvent): boolean {
		const { view, hooks } = this;
		const facts = view.input as InputFactsRecord;
		facts.shiftKey = event.shiftKey;
		hooks.endComposition();
		this.done();
		const click = this.clicks.next(event);
		facts.lastClick = { time: Date.now(), x: event.clientX, y: event.clientY, type: CLICK_TYPES[click] };
		const hit = this.hitAt(event);
		if (!hit) return true;
		const retargeted = hooks.retarget(event, hit);
		const capture = (owner: FaceElement, drag: FaceDrag): void => {
			this.faceDrag = drag;
			this.state = { kind: 'face', owner };
		};
		// a right press starts no face handler and no node view: it selects what it lands on and the menu acts on that (A4)
		const claimed = event.button !== 2 && (runFaceHandlers(view, 'press', retargeted, hit, capture) || viewsStopEvent(retargeted));
		if (claimed || hooks.mousedown(retargeted)) return true;
		if (!view.hasFocus()) view.focus();
		if (click === 'single') this.pressOnce(event, hit);
		else if (click === 'double') this.pressTwice(event, hit, retargeted);
		else this.pressThrice(event, hit, retargeted);
		return true;
	}

	private pressOnce(event: MouseEvent, hit: CanvasHit): void {
		const { view } = this;
		const { doc, selection } = view.state;
		const inside = hit.inside > -1 ? hit.inside : null;
		const target = inside !== null ? doc.nodeAt(inside) : null;
		const draggable = !!target && !!target.type.spec.draggable && target.type.spec.selectable !== false;
		const inNodeSelection = selection instanceof NodeSelection && inside !== null && selection.from <= inside && selection.to > inside;
		const mightDrag = event.button === 0 && target && (draggable || inNodeSelection) ? { node: target, pos: inside! } : null;
		const inRange =
			!selection.empty && !(selection instanceof NodeSelection) && hit.caret.pos >= selection.from && hit.caret.pos <= selection.to;
		this.state = {
			kind: 'pressed',
			button: event.button,
			client: { x: event.clientX, y: event.clientY },
			hit,
			click: 'single',
			selectNode: this.mac ? event.metaKey : event.ctrlKey,
			allowDefault: event.shiftKey,
			mightDrag,
			inRange: event.button === 0 && !event.shiftKey && inRange,
			startDoc: doc
		};
		this.caretOwed = false;
		this.contextHandled = false;
		if (event.button === 1) return;
		if (event.button === 2) {
			this.rightPress(hit);
			return;
		}
		if (event.shiftKey) {
			this.extendTo(selection.anchor, hit.caret);
			return;
		}
		if (onLeaf(hit) || mightDrag || inRange) this.caretOwed = true;
		else this.placeCaret(hit.caret);
	}

	private rightPress(hit: CanvasHit): void {
		const { view } = this;
		const plan = contextClickPlan(view.state, hit, this.mac ? 'mac' : 'linux');
		this.contextHandled = plan.kind === 'keep' || plan.kind === 'node';
		if (plan.kind === 'caret') this.placeCaret(hit.caret);
		else if (plan.kind === 'word') {
			const word = view.canvas.geometry.wordRange(hit.caret);
			updateSelection(view, TextSelection.create(view.state.doc, word.from, word.to));
		} else if (plan.kind === 'node') {
			const selection = NodeSelection.create(view.state.doc, plan.pos);
			markContextSelection(view, selection);
			if (!view.state.selection.eq(selection)) view.dispatch(caretTr(view, selection, hit.caret));
		}
	}

	private pressTwice(event: MouseEvent, hit: CanvasHit, retargeted: CanvasPointerEvent): void {
		const { view } = this;
		if (handleDoubleClick(view, hit.pos, hit.inside, asMouseEvent(retargeted))) return;
		if (onLeaf(hit)) {
			runFaceHandlers(view, 'dblclick', retargeted, hit, () => {});
			return;
		}
		if (event.button !== 0) return;
		const word = view.canvas.geometry.wordRange(hit.caret);
		updateSelection(view, TextSelection.create(view.state.doc, word.from, word.to));
		this.state = { kind: 'selecting', by: 'word', anchor: { pos: word.from, affinity: 1 }, anchorRange: word };
	}

	private pressThrice(event: MouseEvent, hit: CanvasHit, retargeted: CanvasPointerEvent): void {
		const { view } = this;
		if (handleTripleClick(view, hit.pos, hit.inside, asMouseEvent(retargeted))) return;
		const doc = view.state.doc;
		const selection = defaultTripleClick(view, hit.inside, event);
		if (selection instanceof TextSelection && doc.eq(view.state.doc))
			this.state = {
				kind: 'selecting',
				by: 'paragraph',
				anchor: { pos: selection.from, affinity: 1 },
				anchorRange: { from: selection.from, to: selection.to }
			};
	}

	move(event: MouseEvent): void {
		const { state } = this;
		if (state.kind === 'idle') return;
		if (event.buttons === 0 && state.kind !== 'face') {
			this.done();
			return;
		}
		if (state.kind === 'face') {
			this.faceDrag?.move(event, this.hitAt(event));
			this.autoscroll.update({ x: event.clientX, y: event.clientY });
			return;
		}
		if (state.kind === 'pressed') {
			const moved = Math.abs(state.client.x - event.clientX) > DRAG_PX || Math.abs(state.client.y - event.clientY) > DRAG_PX;
			if (!moved) return;
			state.allowDefault = true;
			if (state.button !== 0 || state.mightDrag || state.inRange) return;
			const { selection } = this.view.state;
			const anchor = this.caretOwed ? state.hit.caret.pos : selection.anchor;
			this.state = { kind: 'selecting', by: 'character', anchor: { pos: anchor, affinity: 1 }, anchorRange: { from: anchor, to: anchor } };
			this.caretOwed = false;
		}
		if (this.state.kind === 'selecting') {
			this.selectTo(event);
			this.autoscroll.update({ x: event.clientX, y: event.clientY });
		} else this.autoscroll.stop();
	}

	release(event: MouseEvent): void {
		const { state, view } = this;
		if (state.kind === 'face') {
			const drag = this.faceDrag;
			this.done();
			drag?.release(event, this.hitAt(event));
			return;
		}
		if (state.kind === 'pressed' && !state.allowDefault && state.button !== 1) {
			const hit = view.state.doc === state.startDoc ? state.hit : this.hitAt(event);
			const owed = this.caretOwed;
			const contextHandled = this.contextHandled;
			this.done();
			if (!hit) return;
			const retargeted = this.hooks.retarget(event, hit);
			if (state.button === 2 && contextHandled) return;
			if (state.button !== 2 && (runFaceHandlers(view, 'click', retargeted, hit, () => {}) || viewsStopEvent(retargeted))) return;
			if (handleSingleClick(view, hit.pos, hit.inside, asMouseEvent(retargeted), state.selectNode)) return;
			if (owed && state.button === 0) this.placeCaret(hit.caret);
			return;
		}
		this.done();
	}

	/** what a single press may drag natively: the node it is on, the selection it is in, or nothing */
	dragSource(): { node: PMNode; pos: number } | 'range' | null {
		const { state } = this;
		if (state.kind !== 'pressed' || state.click !== 'single' || state.button !== 0) return null;
		return state.mightDrag ?? (state.inRange ? 'range' : null);
	}

	/** the browser started a drag from the press: no release follows, and the drop places what it places */
	startNativeDrag(): void {
		this.done();
		this.state = { kind: 'nativeDrag' };
	}

	/** drops the press: what a release, a lost release or a new press does */
	done(): void {
		this.state = { kind: 'idle' };
		this.faceDrag = null;
		this.caretOwed = false;
		this.contextHandled = false;
		this.autoscroll.stop();
	}

	private placeCaret(caret: CaretPlace): void {
		const { view } = this;
		const selection = TextSelection.create(view.state.doc, caret.pos);
		if (view.state.selection.eq(selection) && caret.affinity > 0) return;
		view.dispatch(caretTr(view, selection, caret));
	}

	private extendTo(anchor: number, head: CaretPlace, drag = false): void {
		const { view } = this;
		const { doc } = view.state;
		const $anchor = doc.resolve(anchor);
		const $head = drag && head.pos > anchor ? beforeCellStart($anchor, doc.resolve(head.pos)) : doc.resolve(head.pos);
		const selection = view.someProp('createSelectionBetween', (f) => f(view, $anchor, $head)) ?? TextSelection.between($anchor, $head);
		if (view.state.selection.eq(selection)) return;
		const tr = caretTr(view, selection, head);
		view.dispatch(drag ? tr.setMeta(POINTER_DRAG_META, true) : tr);
	}

	/** the head follows the pointer; by word and by paragraph both ends snap outward */
	private selectTo(event: MouseEvent): void {
		const state = this.state;
		if (state.kind !== 'selecting') return;
		const hit = this.hitAt(event);
		if (!hit) return;
		const { view } = this;
		if (state.by === 'character') {
			this.extendTo(state.anchor.pos, dragHead(hit), true);
			return;
		}
		const range = state.by === 'word' ? view.canvas.geometry.wordRange(hit.caret) : selectionForTripleClick(view, hit.inside, false);
		if (!range) return;
		const start = state.anchorRange;
		const backward = range.from < start.from;
		this.extendTo(backward ? start.to : start.from, { pos: backward ? range.from : range.to, affinity: 1 }, true);
	}
}
