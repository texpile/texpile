import type { EditorState, NodeSelection, Selection, Transaction } from 'prosemirror-state';
import type { Slice } from 'prosemirror-model';
import type { Decoration, DirectEditorProps, EditorProps } from 'prosemirror-view';
import type { FaceMedia } from '../views/faceContext';
import type { CanvasEngine } from './engineTypes';
import type { FaceSettings } from './faceTypes';
import type { CanvasGeometry, CaretPlace } from './geometryTypes';
import type { DocPoint, DocRect } from './layoutTypes';
import type { HoverState } from './inputTypes';
import type {
	BlockSettingsOffers,
	CanvasBuildHelpers,
	CanvasMarkViews,
	CanvasNodeViews,
	NestedEditor,
	NodeEstimates
} from './nodeViewTypes';
import type { BlockAction } from './faceTypes';
import type { OverlayAnchors } from './overlayTypes';
import type { ProbeView } from './probeTypes';

export type EditorLanguage = 'latex' | 'typst' | 'markdown';
export type TextblockDirection = 'up' | 'down' | 'left' | 'right' | 'forward' | 'backward';

export type CanvasProps = Pick<
	DirectEditorProps,
	'state' | 'plugins' | 'dispatchTransaction' | 'editable' | 'attributes' | 'handleDOMEvents'
> & {
	language: EditorLanguage;
	nodeViews?: CanvasNodeViews;
	markViews?: CanvasMarkViews;
	nodeEstimates?: NodeEstimates;
	blockSettings?: BlockSettingsOffers;
	/** the window this view lives in (child windows have their own caches) */
	window?: Window;
};

/** the facts prosemirror-view keeps in view.input that plugins peek at */
export type ViewInputFacts = {
	readonly shiftKey: boolean;
	readonly lastKeyCode: number | null;
	readonly lastKeyCodeTime: number;
	readonly lastClick: { time: number; x: number; y: number; type: string };
};

/** the node surface nodeDOM, domAtPos and posAtDOM speak: a FaceElement or FaceText on the canvas, a DOM node in the DOM editor */
export type ViewNodeRef = {
	readonly nodeType: number;
	readonly nodeName: string;
	readonly parentNode: ViewNodeRef | ParentNode | null;
	readonly textContent: string | null;
};

/** what nodeDOM answers: the DOM-lite element surface FaceElement implements */
export type ViewElementRef = ViewNodeRef & {
	readonly tagName: string;
	readonly className: string;
	readonly classList: { contains(name: string): boolean };
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
	matches(selector: string): boolean;
	contains(other: ViewNodeRef | null): boolean;
	getBoundingClientRect(): DOMRect;
	/** a face lives in no document: a cast of nodeDOM's answer to HTMLElement, or instanceof Element on it, fails to compile */
	readonly ownerDocument?: undefined;
};

type DomSelection = ReturnType<Document['getSelection']>;

/** view.root: an event target fed with retargeted events during a press, forwarding these to the document (2.3) */
export type ViewRoot = EventTarget & {
	readonly activeElement: Element | null;
	getSelection(): DomSelection;
	elementFromPoint(x: number, y: number): Element | null;
};

export type ViewDragging = { slice: Slice; move: boolean; node?: NodeSelection };

/** the members the canvas answers (2.1); VisualView once package Z drops the transitional members */
export type CanvasViewMembers = {
	readonly state: EditorState;
	dispatch(tr: Transaction): void;
	updateState(state: EditorState): void;
	setProps(props: Partial<CanvasProps>): void;
	readonly props: Readonly<CanvasProps>;
	someProp<K extends keyof EditorProps, R>(name: K, f: (value: NonNullable<EditorProps[K]>) => R): R | undefined;
	someProp<K extends keyof EditorProps>(name: K): NonNullable<EditorProps[K]> | undefined;
	readonly editable: boolean;
	readonly isDestroyed: boolean;
	readonly composing: boolean;
	readonly input: ViewInputFacts;
	dragging: ViewDragging | null;
	/** the real root div.ProseMirror with its classes and attributes; holds the canvases, the mirror and the input */
	readonly dom: HTMLElement;
	readonly root: ViewRoot;
	hasFocus(): boolean;
	focus(): void;
	coordsAtPos(pos: number, side?: number): { left: number; right: number; top: number; bottom: number };
	posAtCoords(coords: { left: number; top: number }): { pos: number; inside: number } | null;
	endOfTextblock(dir: TextblockDirection, state?: EditorState): boolean;
	/** the node's root element, laying its block out on demand; null for a position that is not a node */
	nodeDOM(pos: number): ViewElementRef | null;
	domAtPos(pos: number, side?: number): { node: ViewNodeRef; offset: number };
	posAtDOM(node: ViewNodeRef, offset: number, bias?: number): number;
	serializeForClipboard(slice: Slice): { dom: HTMLElement; text: string; slice: Slice };
	pasteText(text: string, event?: ClipboardEvent): boolean;
	pasteHTML(html: string, event?: ClipboardEvent): boolean;
	scrollToSelection(): void;
	dispatchEvent(event: Event): void;
	destroy(): void;
	readonly canvas: CanvasExtras;
};

export type CanvasExtras = {
	readonly geometry: CanvasGeometry;
	readonly anchors: OverlayAnchors;
	readonly scroller: HTMLElement;
	readonly hover: HoverState;
	focusState(): 'editor' | 'overlay' | 'away';
	/** the nested editor holding the caret: a formula's or a code island's */
	nested(): NestedEditor | null;
	readonly build: CanvasBuildHelpers;
	/** the selection head as a caret place, with the affinity the move or click that made it gave (CARET_AFFINITY_META) */
	head(): CaretPlace;
	/** client px to doc space, and back */
	docPoint(client: { x: number; y: number }): DocPoint;
	clientRect(rect: DocRect): DOMRect;
	/** the editor's sheet: the column with its padding, where div.ProseMirror's border box was (the gutters stand beside it) */
	sheetClientRect(): DOMRect;
	/** client rect of the node at pos; replaces nodeDOM(pos).getBoundingClientRect() */
	nodeClientRect(pos: number): { rect: DOMRect; estimated: boolean } | null;
	/** the text a node draws (find's match text, TOC glide); replaces nodeDOM(pos).textContent */
	nodeText(pos: number): string;
	rangeClientRects(from: number, to: number, reach?: 'line' | 'text'): DOMRect[];
	/** the y of the line holding pos, estimated for blocks never laid out (comment rail) */
	rangeTop(pos: number): { top: number; estimated: boolean };
	/** the laid-out column widths of the table at tablePos, null while it is not laid out (15.1) */
	columnWidths(tablePos: number): readonly number[] | null;
	/** the actions the node view at pos offers for the bar over its block */
	blockActions(pos: number): readonly BlockAction[];
	/** the decorations a node view's constructor received, outside a build */
	decorationsFor(pos: number): readonly Decoration[];
	revealPos(pos: number, mode: 'nearest' | 'center' | 'start', behavior?: 'auto' | 'smooth'): void;
	/** runs change() and keeps the reading place (or the caret line) where it was */
	holdPosition<T>(change: () => T, anchor?: 'caret' | 'viewport'): T;
	holdWidth(): void;
	releaseWidth(): void;
	/** the editor zoom preference in place of CSS zoom on the root (D18): layout stays unzoomed, paint and hits scale */
	setZoom(zoom: number): void;
	relayout(): void;
	/** another document swapped in: the rows stay hidden until a frame draws it with its inputs in, then onReady runs */
	holdUntilReady(): void;
	/** the rows stay hidden until `placed` settles and a frame draws the place it took (a mode switch's anchor) */
	holdWhilePlacing(placed: Promise<unknown>): void;
	startCrop(pos: number): void;
	onLayout(listener: () => void): () => void;
	onSelection(listener: (selection: Selection) => void): () => void;
	onFrame(listener: () => void): () => void;
	readonly probe: ProbeView | null;
};

/**
 * TRANSITIONAL, deleted by package Z: the DOM editor's answers that callers not yet ported still read, in place of the
 * canvas members of the same names. The canvas view declares these types until then.
 */
export type TransitionalViewMembers = {
	// callers: texpile-tools plans/canvas-rewrite/contract-changes/00-c0.md
	nodeDOM(pos: number): Node | null;
	domAtPos(pos: number, side?: number): { node: Node; offset: number };
	setProps(props: Partial<DirectEditorProps>): void;
};

/** what app code and plugins hold; the narrowed prosemirror-view typings give EditorView exactly these members */
export type VisualView = Omit<CanvasViewMembers, keyof TransitionalViewMembers> & TransitionalViewMembers;

export type CanvasViewSetup = {
	/** the window's engine (D34) */
	readonly engine: CanvasEngine;
	readonly settings: () => FaceSettings;
	readonly media?: FaceMedia;
	/** after the first painted frame with its fonts and visible formulas (G21) */
	readonly onReady?: () => void;
	/** the file probe.views() names this view by, and its pane (by default its place among the window's canvas roots) */
	readonly probe?: { readonly path: () => string; readonly pane?: () => string };
};
