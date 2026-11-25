import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { FaceElement } from '../tree/faceElement';
import type { MarkViewDescs } from '../tree/markViewDesc';
import type { FrameDecorations, WidgetDecorationView } from './decorationTypes';
import type { FaceSettings } from './faceTypes';
import type { CanvasGeometry, CaretPlace } from './geometryTypes';
import type { BlockLayout, DocRect, PositionMap, TextMeasure } from './layoutTypes';
import type { CanvasStyles, ComputedStyle, ElementState, RunStyle } from './styleTypes';
import type { EditorLanguage, VisualView } from './viewTypes';

/** a top-level block of the document model: its node and the position before it */
export type ModelBlock = { readonly node: PMNode; readonly pos: number };

/** what the view core (C1) keeps of the document and the geometry and painter (C2) read (5.6) */
export type DocumentModel = {
	readonly view: VisualView;
	/** the column's content width the blocks are laid out at, unzoomed CSS px */
	readonly width: number;
	readonly count: number;
	block(index: number): ModelBlock;
	/** the block holding pos; a boundary between blocks answers the block after it, the end the last block */
	indexAt(pos: number): number;
	/** the block whose pitch holds the doc y; clamped to the first and last */
	indexAtY(y: number): number;
	/** doc y of the block's border box; estimated while a block above it was never laid out */
	top(index: number): { readonly y: number; readonly estimated: boolean };
	readonly height: number;
	/** the block's layout, laid out now when it has none */
	layout(index: number): BlockLayout;
	/** the layout it has, without laying out */
	cached(index: number): BlockLayout | null;
	/** the layout it was last laid out to, kept while an input it read changed until it lays out again; null when it has none */
	lastLayout(index: number): BlockLayout | null;
	/** the block's element tree, built now when it has none */
	elements(index: number): FaceElement;
};

/** one view's line-breaking state (5.3): the breaks kept above an edit, the word being typed, a preedit */
export type ViewBreaking = {
	/** after each update; the view relays the blocks holding the textblocks it returns, though their nodes are unchanged */
	update(before: EditorState, state: EditorState): readonly PMNode[];
	/** an input method's preedit, document positions: no line ends inside it (11.3); null when it ends */
	compose?(preedit: { readonly from: number; readonly to: number } | null): void;
	/** the document language's hyphenation patterns while they load, null once they are in (the ready gate waits) */
	patternsLoading?(): Promise<void> | null;
};

/** one top-level block handed to the layout: its element tree and what the tree does not say */
export type BlockLayoutRequest = {
	readonly node: PMNode;
	readonly pos: number;
	readonly root: FaceElement;
	readonly positions: PositionMap;
	/** inline and block widget elements in the tree, with their decoration (offsets from the block's start) */
	readonly widgets: ReadonlyMap<FaceElement, WidgetDecorationView>;
	readonly width: number;
	readonly styles: CanvasStyles;
	/** the view's mark views; absent: every mark from its toDOM */
	readonly marks?: MarkViewDescs;
	/** the frame's decorations; the layout reads the ones inside the block */
	readonly decorations: FrameDecorations;
	/** the view's line-breaking state (CanvasEngine.createBreaking) */
	readonly breaking: ViewBreaking;
	/** justify and hyphenate; both enter the layout key */
	readonly settings: FaceSettings;
	/** device pixels per CSS px, DPR times zoom */
	readonly pixelRatio: number;
	/** the block's layout before its node changed or its layout went stale: its unchanged nodes keep their lines (0.5) */
	readonly previous?: BlockLayout | null;
};

/** a view's styles as the view drives them: the root, the selected-node look, epochs and the cost */
export type ViewStyles = CanvasStyles & {
	/** the editor root box's style, which the engine lays out around the column and paints (4.9, 5.2) */
	rootStyle(): ComputedStyle;
	/** the default selectNode: the base's selected-node look on the view's dom */
	markSelectedNode(el: FaceElement, on: boolean): void;
	/** the style read again under the current epochs; a layout half that changed starts a new layout epoch */
	current(style: ComputedStyle): ComputedStyle;
	currentRun(run: RunStyle): RunStyle;
	/** runs after every style epoch bump: mode, theme, window glass, sheets, media, DPR, zoom, fonts, settings */
	onEpoch(listener: () => void): () => void;
	/** once per frame: a custom theme swaps the adopted sheets without an event, and the settings may have changed */
	checkEpoch(): void;
	/** getComputedStyle reads so far, the theme tokens' (frameStats().styleReads) */
	readonly reads: number;
	/** ms spent resolving element styles since the view opened (frameStats().styleMs) */
	readonly styleMs: number;
	/** ms of the theme reads: the token probe and the ground, each the browser's style recalculation of the page */
	readonly themeReadMs: number;
	setState(el: FaceElement, state: ElementState, on: boolean): void;
	destroy(): void;
};

/** what a view's styles read of the view */
export type ViewStylesSetup = {
	/** view.dom: the theme token probe goes under it; a change of its classes is a change of settings */
	readonly root: HTMLElement;
	readonly pageView: () => boolean;
	readonly language: () => EditorLanguage;
	readonly readOnly: () => boolean;
	/** the node an element draws as its nodeDOM, and where */
	readonly nodeOf: (el: FaceElement) => { readonly node: PMNode; readonly getPos: () => number; readonly parent: PMNode | null } | null;
	readonly doc: () => PMNode;
	readonly settings: () => FaceSettings;
};

/** a block as a row of the content canvas drew it */
export type PaintedBlock = { readonly layout: BlockLayout; readonly node: PMNode };

/** a top-level block on a frame: its layout and its doc y */
export type PlacedBlock = { readonly index: number; readonly pos: number; readonly top: number; readonly layout: BlockLayout };

/** what one frame shows (6.2) */
export type PaintFrame = {
	readonly state: EditorState;
	/** the doc rect the canvases show; x counts from the column origin, so the left gutter is negative */
	readonly viewport: DocRect;
	readonly zoom: number;
	readonly dpr: number;
	/** the visible blocks with one above and one below, in document order */
	readonly blocks: readonly PlacedBlock[];
	readonly decorations: FrameDecorations;
	readonly focus: 'editor' | 'overlay' | 'away';
	readonly head: CaretPlace;
	/** the root's border box in doc space and its style: the page view sheet paints there */
	readonly root?: { readonly rect: DocRect; readonly style: ComputedStyle };
	/** an input method's preedit and its underline segments, document positions (11.3) */
	readonly composition?: CompositionPaint | null;
};

export type CompositionPaint = {
	readonly from: number;
	readonly to: number;
	readonly formats: readonly { readonly from: number; readonly to: number; readonly thickness: 'none' | 'thin' | 'thick' }[];
};

/** a caret the caret layer drew (probe.carets()) */
export type DrawnCaret = {
	readonly kind: 'local' | 'blur' | 'gap' | 'math' | 'island' | 'remote';
	readonly rect: DocRect;
	readonly visible: boolean;
	readonly label?: string;
};

/** the caret canvas cleared over the doc rect the carets cover, ctx mapping doc space; null when none is drawn */
export type CaretCanvasTarget = (bounds: DocRect | null) => CanvasRenderingContext2D | null;

/** the painter (6); the frame loop hands it one block at a time, so a throw costs that block alone (D33) */
export type CanvasPainter = {
	/** an opaque ground keeps Chromium's LCD text antialiasing (D17); false in window glass */
	readonly opaque: boolean;
	/** what every block's paint reads beside the frame: the paint epoch and the ground; a change repaints every row */
	paintKey?(): string;
	/** what a block draws beside its layout and the frame's marks: a formula session's selection and call outlines */
	sessionKey?(block: PlacedBlock, frame: PaintFrame): string;
	/** the y bands, in the block's space, where a block's new layout draws differently from one painted before; null
	 * when they cannot be told apart and the whole block repaints */
	changedInk?(before: PaintedBlock, after: PaintedBlock): readonly { from: number; to: number }[] | null;
	/** the content canvas's ground, ctx mapping doc space */
	ground(ctx: CanvasRenderingContext2D, frame: PaintFrame): void;
	/** one block in painting order, ctx mapping the block's own space: origin at its top, x from the column origin */
	paintBlock(ctx: CanvasRenderingContext2D, block: PlacedBlock, frame: PaintFrame): void;
	/** the caret layer on the canvas the target makes for the carets' bounds; blinks come back through repaintCarets */
	paintCarets(frame: PaintFrame, target: CaretCanvasTarget): void;
	/** what the last paintCarets drew */
	carets(): readonly DrawnCaret[];
	destroy(): void;
};

/** the style, layout, geometry and paint engine (C2), one per window so its caches are shared by every view in it (D34) */
export type CanvasEngine = {
	readonly measure: TextMeasure;
	/** one view's styles (S1 plan 2) */
	createStyles(setup: ViewStylesSetup): ViewStyles;
	/** lays out one top-level block at the column width (5.1 to 5.4) */
	layoutBlock(request: BlockLayoutRequest): BlockLayout;
	/** D33: the block as its text in the plain island look (the document font, pre-wrap), with the error set */
	layoutSource(request: BlockLayoutRequest, error: Error): BlockLayout;
	/** the geometry contract (7) over one view's document model */
	createGeometry(model: DocumentModel): CanvasGeometry;
	/** one view's line-breaking state */
	createBreaking(model: DocumentModel): ViewBreaking;
	/** one view's painter; the blink asks for a caret layer repaint through repaintCarets */
	createPainter(model: DocumentModel, repaintCarets: () => void): CanvasPainter;
	/** loads these canvas font strings and the formula fonts, settling after a timeout whatever is still pending */
	loadFonts(fonts: readonly string[]): Promise<void>;
};
