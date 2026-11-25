// the EditorView stand-in (2): the state, plugin and keymap layers run unchanged on it; each member wires to its part
import type { Slice } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { EditorView, type DirectEditorProps, type EditorProps } from 'prosemirror-view';
import type { CanvasPainter, ViewStyles } from './contracts/engineTypes';
import type { CanvasGeometry, CaretPlace } from './contracts/geometryTypes';
import type { OverlayAnchors } from './contracts/overlayTypes';
import type { ProbeView } from './contracts/probeTypes';
import type {
	CanvasExtras,
	CanvasProps,
	CanvasViewSetup,
	TextblockDirection,
	ViewDragging,
	ViewInputFacts,
	ViewNodeRef,
	VisualView
} from './contracts/viewTypes';
import { BlockElements } from './document/blockElements';
import { nodeOfElement, type NodeViewDesc } from './tree/nodeViewDesc';
import { BlockIndex } from './document/blockIndex';
import { ModelCounters } from './document/documentCounters';
import { windowInvalidation } from './document/invalidation';
import { ViewDocument } from './document/viewDocument';
import { WidthHold } from './document/widthHold';
import { PLAIN_FACE_MEDIA } from './views/faceContext';
import { BlockFailures } from './frame/blockFailures';
import { FrameLoop } from './frame/frameLoop';
import { CanvasSurface } from './frame/surface';
import { ClipboardController } from './interaction/clipboard/clipboardController';
import { pasteSlice } from './interaction/clipboard/pasteSlice';
import { FocusModel } from './interaction/focus/focusModel.svelte';
import { SelectionSignal } from './interaction/focus/selectionSignal';
import { HoverTracker } from './interaction/hover/hoverState.svelte';
import { OverlayHost } from './overlays/overlayHost.svelte';
import { KeyRouter } from './interaction/keys/keyRouter';
import { NestedEditors } from './views/nestedEditors';
import { createOverlayAnchors } from './overlays/overlayAnchors';
import { paneOrder, probeEnabled, registerProbeView } from './probe/canvasProbe';
import { createProbeView } from './probe/probeQueries';
import { createCanvasExtras } from './view/canvasExtras';
import { contractView } from './view/devContract';
import { DispatchCycle, selectedPos, type ViewFields } from './view/dispatchCycle';
import { dispatchOwnEvent, DomEventListeners } from './view/domEvents';
import { PluginViews } from './view/pluginViews';
import { PressRouting } from './view/pressRouting';
import { RevealPolicy } from './view/reveal';
import { CanvasViewRoot } from './view/viewRoot';
import { ViewInput } from './view/viewInput';
import { ViewProps } from './view/viewProps';
import * as queries from './view/viewQueries';

export class CanvasView implements VisualView {
	readonly input: ViewInputFacts = { shiftKey: false, lastKeyCode: null, lastKeyCodeTime: 0, lastClick: { time: 0, x: 0, y: 0, type: '' } };
	isDestroyed = false;
	composing = false;
	readonly dom: HTMLElement;
	readonly root: CanvasViewRoot;
	readonly canvas: CanvasExtras;
	/** what plugins, handlers and app code hold: the dev contract proxy in dev and test builds */
	readonly exposed: CanvasView;
	private readonly fields: ViewFields;
	private readonly viewProps: ViewProps;
	private readonly surface: CanvasSurface;
	private readonly styles: ViewStyles;
	private readonly index: BlockIndex;
	private readonly elements: BlockElements;
	private readonly model: ViewDocument;
	private readonly failures = new BlockFailures();
	private readonly widthHold = new WidthHold();
	private readonly queryHost: queries.ViewQueryHost;
	private readonly cycle: DispatchCycle;
	private readonly pluginViews: PluginViews;
	private readonly listeners: DomEventListeners;
	private readonly reveal: RevealPolicy;
	private readonly signal: SelectionSignal;
	private readonly hover = new HoverTracker();
	private readonly nested: NestedEditors;
	private readonly keys: KeyRouter;
	private readonly presses: PressRouting;
	private readonly clipboard: ClipboardController;
	private readonly textInput: ViewInput;
	private readonly focusModel: FocusModel;
	private readonly painter: CanvasPainter;
	private readonly frames: FrameLoop;
	private readonly layoutListeners = new Set<() => void>();
	private readonly frameListeners = new Set<() => void>();
	private readonly cleanups: (() => void)[] = [];
	private geometryOf: CanvasGeometry | null = null;
	private anchorsOf: OverlayAnchors | null = null;
	private readonly overlaid = new Set<NodeViewDesc>();
	private scrollerOf: HTMLElement | null = null;
	private probeOf: ProbeView | null = null;

	constructor(place: HTMLElement, props: CanvasProps, setup: CanvasViewSetup) {
		this.exposed = contractView(this);
		const exposed = this.exposed as unknown as EditorView;
		this.dispatch = this.dispatch.bind(this.exposed);
		this.fields = { state: props.state, editable: true, dragging: null, affinity: 1 };
		this.viewProps = new ViewProps(props);
		this.surface = new CanvasSurface(place);
		this.dom = this.surface.dom;
		const win = this.dom.ownerDocument.defaultView!;
		this.root = new CanvasViewRoot(this.dom);
		this.index = new BlockIndex(props.state.doc);
		this.styles = setup.engine.createStyles({
			root: this.dom,
			pageView: () => this.dom.classList.contains('page-view'),
			language: () => this.viewProps.props.language,
			readOnly: () => !this.fields.editable,
			nodeOf: nodeOfElement,
			doc: () => this.fields.state.doc,
			settings: setup.settings
		});
		const counters = new ModelCounters(this.index);
		this.elements = new BlockElements({
			dom: this.dom,
			counters,
			view: this.exposed,
			media: setup.media ?? PLAIN_FACE_MEDIA,
			props: () => this.viewProps.props,
			editable: () => this.fields.editable,
			schema: () => this.fields.state.schema,
			settings: setup.settings,
			selectedNode: this.styles,
			mutated: (entry) => this.model.mutated(entry),
			overlaid: this.overlaid
		});
		this.model = new ViewDocument({
			view: this.exposed,
			engine: setup.engine,
			styles: this.styles,
			index: this.index,
			counters,
			elements: this.elements,
			failures: this.failures,
			selectedPos: () => selectedPos(this.fields.state, this.nested),
			nodeEstimate: (node, width) => this.elements.estimate(node, width),
			settings: setup.settings,
			pixelRatio: () => this.surface.dpr * this.surface.zoom,
			clientRect: (rect) => this.surface.clientRect(rect),
			changed: () => this.frames?.changed()
		});
		this.queryHost = {
			view: this.exposed,
			dom: this.dom,
			index: this.index,
			elements: this.elements,
			model: this.model,
			selectedPos: () => selectedPos(this.fields.state, this.nested)
		};
		this.reveal = new RevealPolicy({ view: this.exposed, exposed, frames: () => this.frames });
		this.signal = new SelectionSignal(this.dom);
		this.nested = new NestedEditors({
			view: this.exposed,
			holding: (from, to, node) => this.elements.holding(this.index, from, to, selectedPos(this.fields.state, this.nested), node)
		});
		this.keys = new KeyRouter(this.exposed, this.nested, () => null);
		this.clipboard = new ClipboardController(this.exposed, this.nested);
		this.canvas = createCanvasExtras({
			queries: this.queryHost,
			surface: this.surface,
			reveal: this.reveal,
			hover: this.hover,
			nested: () => this.nested.active(),
			geometry: () => (this.geometryOf ??= setup.engine.createGeometry(this.model)),
			anchors: () => (this.anchorsOf ??= createOverlayAnchors(this.exposed, this.cycle.tracked)),
			probe: () => this.probeOf,
			focusPlace: () => this.focusModel.place,
			head: (): CaretPlace => ({ pos: this.fields.state.selection.head, affinity: this.fields.affinity }),
			scroller: () => (this.scrollerOf ??= this.surface.scroller()),
			onSelection: (listener) => this.signal.listen(listener),
			layoutListeners: this.layoutListeners,
			frameListeners: this.frameListeners,
			holdPosition: (change, anchor) => this.frames.holdPosition(change, anchor),
			holdWidth: () => {
				this.widthHold.hold(this.model.width);
				this.frames.requestFrame();
			},
			releaseWidth: () => this.frames.holdPosition(() => this.widthHold.release(), 'viewport'),
			setZoom: (zoom) => this.frames.setZoom(zoom),
			relayout: () => this.frames.requestFrame(),
			ready: () => this.frames.ready
		});
		this.textInput = new ViewInput({
			exposed,
			dom: this.dom,
			keys: this.keys,
			clipboard: this.clipboard,
			nested: () => this.nested.active(),
			characterRects: (from, to) => this.canvas.geometry.charRects(from, to).map((rect) => this.surface.clientRect(rect)),
			setComposing: (on) => (this.composing = on),
			preeditChanged: (range) => {
				this.model.compose(range);
				this.frames.requestFrame();
			},
			noteInput: (at) => this.noteInput(at),
			focusChanged: () => this.focusChanged()
		});
		this.focusModel = new FocusModel(this.dom, this.textInput.surface);
		this.pluginViews = new PluginViews(exposed);
		this.painter = setup.engine.createPainter(this.model, () => this.frames.requestCarets());
		this.frames = new FrameLoop({
			view: this.exposed,
			surface: this.surface,
			index: this.index,
			model: this.model,
			styles: this.styles,
			painter: this.painter,
			reveal: this.reveal,
			widthHold: this.widthHold,
			failures: this.failures,
			onReady: setup.onReady,
			loadFonts: (fonts) => setup.engine.loadFonts(fonts),
			geometry: () => this.canvas.geometry,
			scroller: () => this.canvas.scroller,
			focus: () => this.focusModel.place,
			head: () => this.canvas.head(),
			composition: () => this.textInput.preedit(),
			painted: (moved) => this.painted(moved)
		});
		this.presses = new PressRouting({
			exposed,
			root: this.root,
			hover: this.hover,
			styles: this.styles,
			requestFrame: () => this.frames.requestFrame(),
			endComposition: () => this.textInput.composition.end(),
			dom: this.dom,
			surface: this.surface,
			geometry: () => this.canvas.geometry
		});
		this.listeners = new DomEventListeners(
			this.dom,
			exposed,
			(event) => this.presses.retarget(event),
			(target) => this.surface.isCanvas(target)
		);
		this.cycle = new DispatchCycle({
			exposed,
			fields: this.fields,
			props: this.viewProps,
			pluginViews: this.pluginViews,
			listeners: this.listeners,
			index: this.index,
			elements: this.elements,
			model: this.model,
			reveal: this.reveal,
			signal: this.signal,
			nested: this.nested,
			attributed: [this.dom],
			scroller: () => this.canvas.scroller,
			requestFrame: () => this.frames.requestFrame(),
			docChanged: (mapping) => {
				this.textInput.composition.remap(mapping);
				this.frames.anchor.noteEdit(this.reveal.keyedRecently(), mapping);
			}
		});
		this.cleanups.push(
			windowInvalidation(win).listen((key) => this.model.inputChanged(key)),
			this.styles.onEpoch(() => this.frames.requestFrame())
		);
		if (probeEnabled(win)) this.installProbe(win, setup);
		this.cleanups.push(OverlayHost.mount(this.exposed, this.overlaid, this.hover));
		this.cycle.update(props.state, null);
	}

	get state(): EditorState {
		return this.fields.state;
	}

	get editable(): boolean {
		return this.fields.editable;
	}

	get dragging(): ViewDragging | null {
		return this.fields.dragging;
	}

	set dragging(dragging: ViewDragging | null) {
		this.fields.dragging = dragging;
	}

	get props(): Readonly<CanvasProps> {
		return this.viewProps.propsFor(this.fields.state);
	}

	dispatch(tr: Transaction): void {
		this.cycle.dispatch(tr);
	}

	updateState(state: EditorState): void {
		this.cycle.update(state, this.fields.state);
	}

	/** CanvasProps, or the DOM editor's props an unported caller still passes */
	setProps(props: Partial<CanvasProps> | Partial<DirectEditorProps>): void {
		const changed = this.viewProps.set(props as Partial<CanvasProps>, this.fields.state);
		if (changed.views) {
			this.elements.forget(this.index);
			this.model.forgetLayouts();
		}
		this.cycle.update(this.viewProps.props.state, this.fields.state, changed);
	}

	someProp<K extends keyof EditorProps, R>(name: K, f: (value: NonNullable<EditorProps[K]>) => R): R | undefined;
	someProp<K extends keyof EditorProps>(name: K): NonNullable<EditorProps[K]> | undefined;
	someProp<K extends keyof EditorProps, R>(name: K, f?: (value: NonNullable<EditorProps[K]>) => R): R | undefined {
		return this.viewProps.someProp(name, f, this.fields.state);
	}

	hasFocus(): boolean {
		return this.textInput.surface.hasFocus();
	}

	focus(): void {
		this.textInput.surface.focus();
		this.focusChanged();
	}

	coordsAtPos(pos: number, side = 1): { left: number; right: number; top: number; bottom: number } {
		return queries.coordsAtPos(this.queryHost, pos, side);
	}

	posAtCoords(coords: { left: number; top: number }): { pos: number; inside: number } | null {
		return queries.posAtCoords(this.queryHost, coords);
	}

	endOfTextblock(dir: TextblockDirection, state?: EditorState): boolean {
		return queries.endOfTextblock(this.queryHost, dir, state);
	}

	/** its face root, typed as the DOM editor's Node until package Z drops the transitional members */
	// eslint-disable-next-line @typescript-eslint/naming-convention -- prosemirror-view's name
	nodeDOM(pos: number): Node | null {
		return queries.faceRootAt(this.queryHost, pos) as unknown as Node | null;
	}

	domAtPos(pos: number): { node: Node; offset: number } {
		const { node, offset } = queries.domAtPos(this.queryHost, pos);
		return { node: node as unknown as Node, offset };
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention -- prosemirror-view's name
	posAtDOM(node: ViewNodeRef, offset: number, bias = -1): number {
		return queries.posAtFace(this.queryHost, node, offset, bias);
	}

	/** prosemirror-view's own serializer: it reads only someProp and state and makes its own detached document */
	serializeForClipboard(slice: Slice): { dom: HTMLElement; text: string; slice: Slice } {
		return EditorView.prototype.serializeForClipboard.call(this.exposed as unknown as EditorView, slice);
	}

	/** as prosemirror-view: a plain paste, past the paste event's own handlers */
	pasteText(text: string, event?: ClipboardEvent): boolean {
		return pasteSlice(this.exposed, text, null, true, event ?? new ClipboardEvent('paste'));
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention -- prosemirror-view's name
	pasteHTML(html: string, event?: ClipboardEvent): boolean {
		return pasteSlice(this.exposed, '', html, false, event ?? new ClipboardEvent('paste'));
	}

	scrollToSelection(): void {
		this.reveal.scrollToSelection();
	}

	dispatchEvent(event: Event): void {
		if (event instanceof KeyboardEvent && event.type === 'keydown') this.noteInput(event.timeStamp);
		dispatchOwnEvent(event, {
			exposed: this.exposed as unknown as EditorView,
			keys: this.keys,
			presses: this.presses,
			clipboard: this.clipboard
		});
	}

	destroy(): void {
		if (this.isDestroyed) return;
		this.isDestroyed = true;
		this.frames.destroy();
		this.nested.destroy();
		this.pluginViews.destroy();
		this.elements.destroy(this.index);
		this.listeners.destroy();
		this.presses.destroy();
		for (const cleanup of this.cleanups) cleanup();
		this.focusModel.destroy();
		this.textInput.surface.destroy();
		this.painter.destroy();
		this.styles.destroy();
		this.surface.destroy();
	}

	private installProbe(win: Window, setup: CanvasViewSetup): void {
		this.probeOf = createProbeView({
			view: this.exposed,
			pane: setup.probe?.pane ?? (() => paneOrder(this.dom)),
			path: setup.probe?.path ?? (() => ''),
			language: this.viewProps.props.language,
			queries: this.queryHost,
			frames: this.frames,
			painter: this.painter,
			failures: this.failures,
			measure: setup.engine.measure,
			styles: this.styles
		});
		this.cleanups.push(registerProbeView(win, { probe: this.probeOf, hasFocus: () => this.hasFocus() }));
	}

	private noteInput(at = performance.now()): void {
		this.reveal.noteKey();
		this.frames.noteInput(at);
	}

	private focusChanged(): void {
		const focused = this.focusModel.refresh() === 'editor';
		this.nested.focusChanged();
		this.dom.classList.toggle('ProseMirror-focused', focused);
		this.frames.requestFrame();
	}

	/** after a painted frame: the input surface follows the caret, then onLayout when geometry moved, then onFrame */
	private painted(moved: boolean): void {
		if (this.hasFocus()) {
			const caret = this.canvas.nested()?.caretRect() ?? this.canvas.geometry.caretRect(this.canvas.head());
			this.textInput.follow(caret && this.surface.clientRect(caret));
		}
		if (moved) for (const listener of this.layoutListeners) listener();
		for (const listener of this.frameListeners) listener();
	}
}

/** the view plugins and app code hold: in dev and test builds a proxy that throws on a member the canvas lacks */
export function createCanvasView(place: HTMLElement, props: CanvasProps, setup: CanvasViewSetup): CanvasView {
	return new CanvasView(place, props, setup).exposed;
}
