import type { Node as PMNode } from 'prosemirror-model';
import type { FaceElement } from '../tree/faceElement';
import type { Edges, ComputedStyle, RunStyle } from './styleTypes';
import type { FaceInputKey } from './invalidationTypes';

/** doc space: CSS px at zoom 1, origin at the column's content box top-left */
export type DocRect = { x: number; y: number; width: number; height: number };
export type DocPoint = { x: number; y: number };

/** a text width in CSS px for a canvas font string; the window's shared measurer (5.4) or a test double */
export type TextMeasure = (font: string, text: string) => number;

export type LayoutBoxKind = 'block' | 'inline-block' | 'flex' | 'grid' | 'table' | 'row' | 'cell' | 'columns' | 'replaced' | 'anonymous';

export type LayoutBox = {
	/** null for anonymous boxes */
	readonly element: FaceElement | null;
	readonly pseudo: 'before' | 'after' | 'marker' | null;
	readonly style: ComputedStyle;
	/** border box relative to the parent box's border box, so a cached subtree moves without recompute */
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	/** margins after collapsing, used by the parent to stack */
	readonly margin: Edges<number>;
	readonly kind: LayoutBoxKind;
	readonly children: readonly LayoutBox[];
	/** set when the box holds inline content */
	readonly lines: readonly LineBox[] | null;
	/** the PM node this box is the root of; offset from the top-level block's start */
	readonly node: { node: PMNode; offset: number } | null;
	readonly baselines: { first: number; last: number } | null;
	/** horizontal scroll region */
	readonly scroll: { contentWidth: number; key: string } | null;
	readonly clip: boolean;
	/** a textblock split across columns: the later pieces' rects in this box's space, their lines carried there */
	readonly continuations?: readonly DocRect[];
};

export type LineBox = {
	readonly y: number;
	readonly height: number;
	readonly baseline: number;
	/** the strut's content area (font ascent and descent): reach 'text' fills and the blur caret */
	readonly textTop: number;
	readonly textBottom: number;
	/** content offsets of the first and last caret stop on the line */
	readonly from: number;
	readonly to: number;
	/** visual order */
	readonly fragments: readonly LineFragment[];
	readonly hyphen: LineFragment | null;
	/** a range continuing past this line extends its fill this far past the last glyph (Chromium) */
	readonly endExtension: number;
	/** its spaces were stretched to the measure: a held paragraph's justified line, whatever its text-align says */
	readonly justified?: boolean;
};

export type LineFragment =
	| {
			kind: 'text';
			x: number;
			width: number;
			text: string;
			run: RunStyle;
			from: number;
			to: number;
			level: number;
			advances: Float32Array | null;
	  }
	| { kind: 'atomic'; x: number; width: number; ascent: number; descent: number; box: LayoutBox; from: number; to: number }
	| { kind: 'edge'; x: number; width: number; run: RunStyle; side: 'start' | 'end' }
	| { kind: 'hyphen'; x: number; width: number; run: RunStyle; at: number }
	| { kind: 'generated'; x: number; width: number; text: string; style: ComputedStyle }
	| { kind: 'widget'; x: number; width: number; box: LayoutBox | null; at: number; side: number }
	/** at: the widget's place, from the top-level block's start */
	| { kind: 'struck'; x: number; width: number; text: string; run: RunStyle; widget: string; at: number };

/** element to position map of one laid-out top-level block; offsets from the block's start */
export type PositionMap = {
	/** the offset before the node this element is the root of, or null for an element inside a face */
	posOf(element: FaceElement): number | null;
	/** the root element of the node at this offset */
	elementAt(offset: number): FaceElement | null;
	/** where the element's hole starts, or null when it holds no content */
	contentStart(element: FaceElement): number | null;
};

export type BlockLayout = {
	readonly box: LayoutBox;
	readonly height: number;
	/** collapsed margins this block exposes to its siblings in the root flow */
	readonly outerMargin: { top: number; bottom: number };
	readonly positions: PositionMap;
	readonly keys: readonly FaceInputKey[];
	/** set when D33 drew this block as source */
	readonly error: Error | null;
};

/** the mutable form of LayoutBox a formatting context fills */
export type LayoutBoxBuilder = {
	element: FaceElement | null;
	pseudo: LayoutBox['pseudo'];
	style: ComputedStyle;
	x: number;
	y: number;
	width: number;
	height: number;
	margin: Edges<number>;
	kind: LayoutBoxKind;
	children: LayoutBoxBuilder[];
	lines: LineBox[] | null;
	node: LayoutBox['node'];
	baselines: LayoutBox['baselines'];
	scroll: LayoutBox['scroll'];
	clip: boolean;
	continuations?: DocRect[];
};

export type LayoutInput = {
	/** the containing block's content width, and its height when definite */
	readonly width: number;
	readonly height: number | null;
	readonly measure: TextMeasure;
	/** lays a child out in its own formatting context at a border-box width and sets its height */
	layout(child: LayoutBoxBuilder, width: number): void;
	/** min-content and max-content border-box widths */
	intrinsic(child: LayoutBoxBuilder): { min: number; max: number };
};

/** places the children in the box's content box (x and y from its border box) and sets the box's height */
export type FormattingContext = (draft: LayoutBoxBuilder, children: readonly LayoutBoxBuilder[], input: LayoutInput) => void;
