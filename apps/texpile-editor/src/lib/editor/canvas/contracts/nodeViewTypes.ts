import type { Fragment as PMFragment, Mark, Node as PMNode } from 'prosemirror-model';
import type { Decoration, DecorationSource } from 'prosemirror-view';
import type { FaceElement, faceElement } from '../tree/faceElement';
import type {
	BitmapSource,
	BitmapState,
	BlockAction,
	BlockSettingsOffer,
	DocumentCounters,
	FaceSettings,
	FaceUiState,
	LucideIconName,
	MathSource,
	OverlaySpec,
	ReplacedHit
} from './faceTypes';
import type { FaceInputKey } from './invalidationTypes';
import type { DocRect } from './layoutTypes';
import type { VisualView } from './viewTypes';

/** a real event retargeted at the hit FaceElement, or at the view's dom for keys */
export type RetargetedEvent<E extends Event> = Omit<E, 'target'> & { readonly target: FaceElement };
export type CanvasEvent =
	RetargetedEvent<MouseEvent> | RetargetedEvent<KeyboardEvent> | RetargetedEvent<ClipboardEvent> | RetargetedEvent<DragEvent>;

/** what a focused contenteditable inside a DOM node view did by itself (CaretOwner, renamed) */
export type NestedEditor = {
	readonly kind: 'math' | 'code';
	keydown(event: KeyboardEvent): 'handled' | 'pass';
	/** MathLive's Backspace at start, Shift+Enter */
	keydownAfter?(event: KeyboardEvent): 'handled' | 'pass';
	insertText(text: string, replace: { from: number; to: number } | null): boolean;
	composition(phase: 'start' | 'update' | 'end', text: string): boolean;
	clipboard(event: ClipboardEvent): boolean;
	/** where it draws its caret; the caret layer paints it */
	caretRect(): DocRect | null;
	/** a formula's own selection, doc space */
	selectionRects?(): DocRect[];
	/** a selected macro call in a formula: outlined, its selection left clear */
	outlineRects?(): DocRect[];
	/** the doc x the last Up or Down aimed at: one that left the editor hands it to the next */
	verticalGoal?(): number | null;
	/** where a click inside lands, in dom's content box; null: not inside */
	hit(x: number, y: number): ReplacedHit | null;
	end(reason: 'selection' | 'blur' | 'deleted' | 'replaced' | 'destroy'): void;
};

/** prosemirror-view's NodeView, member for member, on FaceElements */
export type CanvasNodeView = {
	dom: FaceElement;
	/** the core lays out and edits the children here; absent: an atom */
	contentDOM?: FaceElement | null;
	/** true keeps this view for the new node; absent: prosemirror-view's rule */
	update?(node: PMNode, decorations: readonly Decoration[], innerDecorations: DecorationSource): boolean;
	multiType?: boolean;
	/** absent: the core puts the base's selected-node look on dom */
	selectNode?(): void;
	deselectNode?(): void;
	/** called while the selection is inside the node; a nested editor starts or moves here */
	setSelection?(anchor: number, head: number, root: VisualView): void;
	/** true: prosemirror-view's own handling skips the event (keys, pointer, clipboard, drag) */
	stopEvent?(event: CanvasEvent): boolean;
	destroy?(): void;

	// canvas-only, where no DOM answers
	/** the running nested editor: it owns the caret, reads input and says where its caret and clicks are */
	readonly nested?: NestedEditor | null;
	/** HTML controls anchored to the node (gear, crop bar, Edit button); a DOM node view held them in dom */
	overlays?(ui: FaceUiState): readonly OverlaySpec[];
	/** the block's own actions for the bar over it while it is selected whole */
	actions?(): readonly BlockAction[];
};

/** prosemirror-view's MarkView on FaceElements */
export type CanvasMarkView = {
	dom: FaceElement;
	contentDOM?: FaceElement | null;
	update?(mark: Mark): boolean;
	destroy?(): void;
};

export type CanvasNodeViewConstructor = (
	node: PMNode,
	view: VisualView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[],
	innerDecorations: DecorationSource
) => CanvasNodeView;
export type CanvasMarkViewConstructor = (mark: Mark, view: VisualView, inline: boolean) => CanvasMarkView;
export type CanvasNodeViews = Readonly<Record<string, CanvasNodeViewConstructor>>;
export type CanvasMarkViews = Readonly<Record<string, CanvasMarkViewConstructor>>;
/** a height before the first build (images, formulas, cards): no DOM answers this either */
export type NodeEstimates = Readonly<Record<string, (node: PMNode, width: number, view: VisualView) => number | null>>;
/** the block handle's gear and the context menu's Settings item, by node type */
export type BlockSettingsOffers = Readonly<Record<string, BlockSettingsOffer>>;

/** what a plugin's canvasViews(setup) returns; composeNodeViews throws on a type two plugins draw */
export type CanvasViewSet = {
	readonly nodeViews?: CanvasNodeViews;
	readonly markViews?: CanvasMarkViews;
	readonly estimates?: NodeEstimates;
	readonly blockSettings?: BlockSettingsOffers;
};

/** view.canvas.build: valid only inside a node or mark view's constructor or update call */
export type CanvasBuildHelpers = {
	readonly counters: DocumentCounters;
	/** a view that reads a setting builds again when the settings change */
	readonly settings: FaceSettings;
	el: typeof faceElement;
	/** reads an async or store input and relays the block being built when it changes */
	read<T>(key: FaceInputKey, value: () => T): T;
	bitmap(source: BitmapSource): BitmapState;
	/** a replaced formula element */
	math(source: MathSource): FaceElement;
	icon(name: LucideIconName, size: number): FaceElement;
	checkbox(checked: boolean): FaceElement;
	/** a PM fragment laid out as nested content (Typst drawTypstMarkup, gone suggestion blocks) */
	serializeFragment(fragment: PMFragment, inline: boolean): FaceElement;
	/** a box sized by a mounted overlay (the paper cropper, the no-caption banner) */
	overlaySlot(name: string): FaceElement;
};
