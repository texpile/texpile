// a formula being edited: MathLive's model behind the canvas, written back into the document on every input (13.6)
import { HeadlessMathfield, type MathLayout } from 'mathlive';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { mathMacros } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import { isMathLatexEmpty, syncBlockMathAttrs } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';
import { mathFormat, mathSyntaxOf, type MathSyntax } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';
import { mathUnchanged, withoutEmptySlots } from '$lib/editor/visual/extensions/mathlivebridge/mlEquivalent';
import { themeColorMap } from '$lib/editor/visual/extensions/mathlivebridge/themeBlack';
import { observe } from '$lib/runes/observe.svelte';
import { followSnippetShortcuts } from '$lib/editor/snippets/visual/mathliveSnippets';
import { isMac } from '$lib/platform';
import type { MathSession } from '../../contracts/sessionTypes';
import type { ReplacedHit } from '../../contracts/faceTypes';
import type { DocRect } from '../../contracts/layoutTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { windowTextMeasure } from '../../layout/text/textMeasure';
import { windowFontMetrics } from '../../layout/text/fontMetrics';
import type { FaceElement } from '../../tree/faceElement';
import { frameFormula, formulaFrameOf } from '../mathLooks';
import { editFormula, formulaPlacingOf, type FormulaPlacing } from '../mathReplaced';
import { MathGeometryHost } from './mathGeometryHost';
import { MathExit } from './mathExit';
import { routeMathKey } from './mathKeyRoute';
import { mathPointerCapture } from './mathPointer';
import { anchorsOf } from './mathAnchors';
import { completeTypedMacro, selectedMacroCall } from './mathMacroKeys';
import { enterAtGoal } from './mathGoalEntry';

/** how the session was entered: at an end, at a pressed point, or at the atom nearest a goal x (A5) */
export type MathEntry = { kind: 'start' | 'end' } | { kind: 'vertical'; dir: -1 | 1; x: number };

export type MathSessionHooks = {
	/** what an end for this reason is now; null keeps the session */
	leaving(session: CanvasMathSession, reason: MathEndReason): MathEndReason | null;
	/** the session is over: its view drops it */
	ended(session: CanvasMathSession): void;
	/** after a history step ended the session: the formula the selection is in now starts its own */
	restart(): void;
};

export type MathEndReason = 'selection' | 'blur' | 'deleted' | 'replaced' | 'destroy';

/** the caret's look in em of the box it follows: MathLive's clamp(2px, .08em, 10px) by .76em, from .05em under its row's
 * baseline, .045em left (.019em in LaTeX entry, as tall as its box) */
const CARET = { minPx: 2, em: 0.08, maxPx: 10, height: 0.76, below: 0.05, left: 0.045, latexLeft: 0.019 };
/** the inline-block .ML__caret span: its line box around the .76em bar, in em of its font */
const CARET_SPAN = { above: 0.935, height: 1.2 };

export class CanvasMathSession implements MathSession {
	readonly kind = 'math';
	readonly field: HeadlessMathfield;
	readonly syntax: MathSyntax;
	readonly display: boolean;
	readonly geometry: MathGeometryHost;
	readonly exit: MathExit;
	/** the formula element drawing the session, which a rebuild of its view replaces */
	private element: FaceElement | null = null;
	/** a history step is running: the session keeps through the update it dispatches (A8) */
	holding = false;
	scrollX = 0;
	/** the x Up and Down leave the formula at, doc px (A5), kept while the caret stays at goalOffset */
	goalX: number | null = null;
	goalOffset = -1;
	private latest: MathLayout | null = null;
	private writing = false;
	/** no input yet: a formula made empty by Ctrl+M survives its first leave */
	private newlyCreated = true;
	private ended = false;
	private readonly cleanups: (() => void)[] = [];

	constructor(
		readonly view: VisualView,
		public pos: number,
		public node: PMNode,
		private readonly hooks: MathSessionHooks
	) {
		this.syntax = mathSyntaxOf(node);
		this.display = node.isBlock;
		this.geometry = new MathGeometryHost({
			view,
			pos: () => this.pos,
			display: () => this.display,
			layout: () => this.layout,
			placing: () => this.placing,
			scrollX: () => this.scrollX,
			scrollBy: (dx) => this.scrollBy(dx)
		});
		const win = (view.dom.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
		const measure = windowTextMeasure(win);
		const metrics = windowFontMetrics(win);
		this.field = new HeadlessMathfield({
			value: '',
			syntax: this.syntax,
			defaultMode: this.display ? 'math' : 'inline-math',
			readOnly: !view.editable,
			colorMap: themeColorMap,
			geometry: this.geometry,
			pointerCapture: mathPointerCapture(view),
			measure,
			extents: (font) => metrics(font),
			family: () => this.placing.family,
			layoutChanged: (layout) => this.layoutChanged(layout),
			openMenu: () => anchorsOf(this).openMenu(),
			focus: () => {
				if (!view.hasFocus()) view.focus();
			}
		});
		this.field.setValue(node.textContent, { format: mathFormat(this.syntax), mode: 'math', silenceNotifications: true });
		if (isMac) this.field.keybindings = this.field.keybindings.filter((binding) => binding.key !== '[IntlBackslash]');
		this.exit = new MathExit(this);
		this.listen();
	}

	private listen(): void {
		const { field } = this;
		const onInput = () => {
			this.writeBack();
			completeTypedMacro(this);
		};
		const onMoveOut = (event: Event) => {
			event.preventDefault();
			this.exit.moveOut((event as CustomEvent<{ direction: string }>).detail.direction);
		};
		field.addEventListener('input', onInput);
		field.addEventListener('move-out', onMoveOut);
		this.cleanups.push(() => {
			field.removeEventListener('input', onInput);
			field.removeEventListener('move-out', onMoveOut);
		});
		if (this.syntax === 'latex')
			this.cleanups.push(
				observe(
					() => mathMacros.current,
					() => this.applyMacros()
				)
			);
		this.cleanups.push(
			followSnippetShortcuts(
				this.syntax === 'typst'
					? { syntax: 'typst', display: this.display, set: (shortcuts) => (field.typstShortcuts = shortcuts) }
					: {
							syntax: 'latex',
							display: this.display,
							defaults: field.inlineShortcuts,
							set: (shortcuts) => (field.inlineShortcuts = shortcuts)
						}
			)
		);
	}

	/** the paper's \newcommand definitions, applied silenced: the same formula shown again is no edit */
	private applyMacros(): void {
		const macros = mathMacros.current;
		const selection = this.field.selection;
		this.field.macros = { ...this.field.macros, ...macros };
		this.field.setValue(this.node.textContent, { format: 'latex-expanded', mode: 'math', silenceNotifications: true });
		this.field.selection = selection;
	}

	get placing(): FormulaPlacing {
		return (this.element && formulaPlacingOf(this.element)) ?? { size: 16, family: 'serif', ascent: 0, descent: 0 };
	}

	/** the view's formula element: the view hands a new one over on every build */
	attach(element: FaceElement | null, built = false): void {
		if (element === this.element) return;
		if (this.element) editFormula(this.element, null);
		this.element = element;
		if (!element) return;
		editFormula(element, { layout: () => this.layout, scrollX: () => this.scrollX });
		frameFormula(element, { pending: this.exit.pending });
		if (!built) element.noteMutation();
	}

	markPending(on: boolean): void {
		if (this.element) frameFormula(this.element, { pending: on });
	}

	/** T6: the field emptied draws the empty frame though its node keeps the last text until the session ends */
	private markEmpty(): void {
		const empty = this.isEmpty();
		if (this.element && formulaFrameOf(this.element)?.empty !== empty) frameFormula(this.element, { empty });
	}

	/** A8: a history step keeps the session while it touched only this formula and the formula is still there */
	holdThroughHistory(step: () => void): void {
		const { view } = this;
		const before = view.state.doc;
		const { pos, node } = this;
		this.holding = true;
		try {
			step();
		} finally {
			this.holding = false;
		}
		if (this.ended) return;
		const after = view.state.doc;
		const now = after.nodeAt(this.pos);
		const outside =
			!now ||
			now.type !== node.type ||
			!before.slice(0, pos).eq(after.slice(0, this.pos)) ||
			!before.slice(pos + node.nodeSize).eq(after.slice(this.pos + now.nodeSize));
		if (outside) {
			this.end('replaced');
			this.hooks.restart();
		} else if (
			!(view.state.selection instanceof NodeSelection && view.state.selection.from === this.pos) &&
			view.state.selection.$from.parent !== now
		)
			view.dispatch(view.state.tr.setSelection(NodeSelection.create(after, this.pos)));
	}

	get layout(): MathLayout {
		this.field.renderNow();
		return this.latest ?? this.emptyLayout();
	}

	private emptyLayout(): MathLayout {
		return { width: 0, ascent: 0.5, descent: 0.25, items: [], atoms: new Map(), selection: [], macroCalls: [], rows: [] };
	}

	/** a size change lays the formula's block out again; a caret or selection change only paints */
	private layoutChanged(layout: MathLayout): void {
		const before = this.latest;
		this.latest = layout;
		if (this.ended) return;
		this.markEmpty();
		const sized = !before || before.width !== layout.width || before.ascent !== layout.ascent || before.descent !== layout.descent;
		if (sized) this.element?.noteMutation();
		this.view.canvas.relayout();
	}

	/** MathLive's caret, doc space, on the row that holds it; null while a range is selected */
	caretRect(): DocRect | null {
		const caret = this.layout.caret;
		const box = this.geometry.caretBox();
		const place = this.geometry.place();
		if (!caret || !box || !place || !this.field.selectionIsCollapsed) return null;
		const em = caret.em * place.size;
		const width = Math.min(CARET.maxPx, Math.max(CARET.minPx, CARET.em * em));
		if (caret.kind === 'latex') return { x: box.x - CARET.latexLeft * em, y: box.top, width, height: box.bottom - box.top };
		const bottom = place.baseline + caret.baseline * place.size + CARET.below * em;
		return { x: box.x - CARET.left * em, y: bottom - CARET.height * em, width, height: CARET.height * em };
	}

	hit(x: number, y: number): ReplacedHit | null {
		return this.geometry.hit(x, y);
	}

	caretClientRect(): DOMRect | null {
		const rect = this.caretRect();
		return rect && this.view.canvas.clientRect(rect);
	}

	caretElementRect(): DOMRect | null {
		const caret = this.layout.caret;
		const place = this.geometry.place();
		if (!caret || !place || !this.field.selectionIsCollapsed) return null;
		const em = caret.em * place.size;
		const x = place.rect.x + caret.x * place.size - this.scrollX;
		const baseline = place.baseline + caret.baseline * place.size;
		return this.view.canvas.clientRect({ x, y: baseline - CARET_SPAN.above * em, width: 0, height: CARET_SPAN.height * em });
	}

	selectionClientRects(): DOMRect[] {
		return this.selectionRects().map((rect) => this.view.canvas.clientRect(rect));
	}

	atomClientRect(id: string): DOMRect | null {
		const atom = this.layout.atoms.get(id);
		const place = this.geometry.place();
		return atom && place ? this.view.canvas.clientRect(this.geometry.docRectOf(atom, place)) : null;
	}

	macroCallClientRect(index: number): DOMRect | null {
		const call = this.layout.macroCalls[index];
		const place = this.geometry.place();
		return call && place ? this.view.canvas.clientRect(this.geometry.docRectOf(call.rect, place)) : null;
	}

	formulaClientRect(): DOMRect {
		const place = this.geometry.place();
		return place ? this.view.canvas.clientRect(place.rect) : this.view.canvas.nodeClientRect(this.pos)!.rect;
	}

	/** MathLive's selection rects, doc space, cut where the column cuts the formula; a selected macro call is outlined instead */
	selectionRects(): DocRect[] {
		const place = this.geometry.place();
		if (!place || selectedMacroCall(this) !== null) return [];
		const field = this.geometry.fieldDocRect(place);
		const visible = this.geometry.visibleDocRect(place);
		return this.field.selectionRects().flatMap((r) => {
			const left = Math.max(visible.x, field.x + r.left - this.scrollX);
			const right = Math.min(visible.x + visible.width, field.x + r.right - this.scrollX);
			return right > left || r.right === r.left
				? [{ x: left, y: field.y + r.top, width: Math.max(0, right - left), height: r.bottom - r.top }]
				: [];
		});
	}

	outlineRects(): DocRect[] {
		const index = selectedMacroCall(this);
		const place = this.geometry.place();
		const call = index === null ? null : this.layout.macroCalls[index];
		return call && place ? [this.geometry.docRectOf(call.rect, place)] : [];
	}

	isEmpty(): boolean {
		return isMathLatexEmpty(this.field.getValue(mathFormat(this.syntax)));
	}

	/** what the field holds, as its node keeps it: a slot left empty is written as TeX reads one */
	contentOf(): string {
		const value = this.field.getValue(mathFormat(this.syntax));
		return this.syntax === 'latex' ? withoutEmptySlots(value) : value;
	}

	/** T5: each input becomes one transaction, the selection inside the formula; a respelling only is not written */
	private writeBack(): void {
		if (this.writing || this.ended) return;
		this.newlyCreated = false;
		if (!this.isEmpty()) this.exit.disarm();
		const text = this.contentOf();
		if (mathUnchanged(this.syntax, this.node.textContent, text) || !text.length) return;
		const { view, node, pos } = this;
		const attrs = this.display && this.syntax === 'latex' ? syncBlockMathAttrs(node, text) : { ...node.attrs };
		const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, node.type.create(attrs, view.state.schema.text(text), node.marks));
		tr.setSelection(TextSelection.create(tr.doc, pos + 1));
		this.writing = true;
		try {
			view.dispatch(tr);
		} finally {
			this.writing = false;
		}
	}

	/** after every update: the node mapped; a change from outside (undo, a collaborator, the disk) goes into MathLive */
	follow(pos: number, node: PMNode): void {
		this.pos = pos;
		const before = this.node;
		this.node = node;
		if (this.writing || before === node) return;
		if (mathUnchanged(this.syntax, node.textContent, this.contentOf())) return;
		this.showText(node.textContent);
	}

	/** A8: the restored text silenced, the caret where MathLive's own snapshot of that text had it, else at the end */
	showText(text: string): void {
		const { field } = this;
		const match = field
			.undoSnapshots(mathFormat(this.syntax))
			.find((snapshot) => mathUnchanged(this.syntax, text, this.syntax === 'latex' ? withoutEmptySlots(snapshot.value) : snapshot.value));
		field.setValue(text, { format: mathFormat(this.syntax), mode: 'math', silenceNotifications: true });
		if (match) field.selection = match.selection;
		else field.position = field.lastOffset;
	}

	enter(entry: MathEntry): void {
		const { field } = this;
		field.onFocus();
		if (entry.kind === 'vertical') {
			this.goalX = entry.x;
			this.goalOffset = enterAtGoal(this, entry.dir, entry.x);
		} else field.executeCommand(entry.kind === 'start' ? 'moveToMathfieldStart' : 'moveToMathfieldEnd');
	}

	/** only a display wider than its block scrolls (E8), and no further than its overflow */
	scrollBy(dx: number): void {
		const place = this.geometry.place();
		const room = place ? this.geometry.fieldDocRect(place).width - this.geometry.visibleDocRect(place).width : 0;
		const next = Math.min(room, Math.max(0, this.scrollX + dx));
		if (next === this.scrollX) return;
		this.scrollX = next;
		this.view.canvas.relayout();
	}

	keydown(event: KeyboardEvent): 'handled' | 'pass' {
		return routeMathKey(this, event);
	}

	verticalGoal(): number | null {
		return this.goalX;
	}

	/** Up and Down after the first aim at the x the first started from, through the rows and out of the formula (A5);
	 * the first moves by MathLive's own rule, from its atom's right edge */
	aimVertically(event: KeyboardEvent): boolean {
		const { field } = this;
		const vertical = (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey && !event.ctrlKey && !event.metaKey;
		if (!vertical || this.goalOffset !== field.position) this.goalX = null;
		const kept = vertical ? this.goalX : null;
		if (vertical) this.goalX ??= this.geometry.caretBox()?.x ?? null;
		const place = this.geometry.place();
		field.verticalGoalX = kept !== null && place ? kept - place.rect.x + this.scrollX : undefined;
		return vertical;
	}

	/** the goal holds while the caret stays where the vertical move put it */
	keepGoalHere(): void {
		this.goalOffset = this.field.position;
	}

	insertText(text: string): boolean {
		this.field.onInput(text);
		return true;
	}

	composition(phase: 'start' | 'update' | 'end', text: string): boolean {
		if (phase === 'start') this.field.onCompositionStart(text);
		else if (phase === 'update') this.field.onCompositionUpdate(text);
		else this.field.onCompositionEnd(text);
		return true;
	}

	clipboard(event: ClipboardEvent): boolean {
		// nothing selected inside: the copy or cut is of the formula, as the editor's own clip
		if (event.type !== 'paste' && this.field.selectionIsCollapsed && this.wholeSelected()) return false;
		if (event.type === 'copy') this.field.onCopy(event);
		else if (event.type === 'cut') this.field.onCut(event);
		else this.field.onPaste(event);
		event.preventDefault();
		return true;
	}

	private wholeSelected(): boolean {
		const { selection } = this.view.state;
		return selection instanceof NodeSelection && selection.from === this.pos;
	}

	/** T4 and T6: an emptied formula goes, unless it was just made and never typed in */
	end(asked: MathEndReason): void {
		if (this.ended) return;
		const reason = this.hooks.leaving(this, asked);
		if (!reason) return;
		this.ended = true;
		const empty = this.isEmpty();
		this.field.selection = { ranges: [[0, 0]] };
		this.field.onBlur();
		for (const cleanup of this.cleanups) cleanup();
		// the key or press that ended the session is still running in MathLive
		queueMicrotask(() => this.field.dispose());
		if (this.element) {
			editFormula(this.element, null);
			frameFormula(this.element, { pending: false, empty: isMathLatexEmpty(this.node.textContent) });
			this.element.noteMutation();
		}
		this.hooks.ended(this);
		// after the update that ended it; the place the writer went to keeps the caret
		if ((reason === 'selection' || reason === 'blur') && empty && (this.exit.pending || !this.newlyCreated))
			queueMicrotask(() => this.exit.deleteNow(-1, false));
	}

	get isOver(): boolean {
		return this.ended;
	}
}
