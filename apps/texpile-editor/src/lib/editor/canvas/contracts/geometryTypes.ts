import type { EditorState } from 'prosemirror-state';
import type { Mark } from 'prosemirror-model';
import type { FaceElement } from '../tree/faceElement';
import type { DocPoint, DocRect } from './layoutTypes';
import type { TextblockDirection } from './viewTypes';

export type ScrollBoxAt = { readonly element: FaceElement; readonly rect: DocRect; readonly max: number };

/** -1: the place ends the earlier line (End, a click past a line end); 1: it starts the later one */
export type Affinity = -1 | 1;
export type CaretPlace = { readonly pos: number; readonly affinity: Affinity };
/** one Left or Right on a line holding right-to-left text */
export type VisualStep =
	| { readonly kind: 'place'; readonly place: CaretPlace }
	// an inline leaf stands that way: its position and the place past it
	| { readonly kind: 'leaf'; readonly pos: number; readonly past: CaretPlace }
	// the textblock ends that way, in this logical direction
	| { readonly kind: 'edge'; readonly dir: -1 | 1 };
/** where a word move reads from on a line holding right-to-left text, and the logical direction it reads in */
export type VisualWordStart =
	| { readonly kind: 'from'; readonly place: CaretPlace; readonly dir: -1 | 1 }
	| { readonly kind: 'leaf'; readonly past: CaretPlace }
	| { readonly kind: 'edge'; readonly dir: -1 | 1 };
/** the transaction meta a move or a click sets when the head it makes has affinity -1 */
export const CARET_AFFINITY_META = 'canvasCaretAffinity';
/** the transaction meta a Page key sets: it scrolled the pane itself, so the reveal leaves it */
export const PAGE_KEY_META = 'canvasPageKey';

export type CaretPolicy =
	// inline content the caret walks: paragraph, heading, caption, cell paragraph, notes, term title
	| 'text'
	// an inline leaf whose text is not edited in place: one stop each side, Left/Right NodeSelect it
	| 'atom'
	// a drawn chip that stands as one character (\,, ~, accents, \pause): stepped and deleted at once
	| 'character'
	// a drawn chip on a line of its own (comment, \vspace, divider): a stop for vertical arrows
	| 'ownLine'
	// a block drawn whole (placeholder, bibliography card, figure card, includedoc, hr): NodeSelection only
	| 'drawnBlock'
	// source text edited natively; the caret goes inside (raw_latex, code_block, inline_latex as source)
	| 'island'
	// NodeSelect first, then the math session owns the caret
	| 'formula'
	// a block atom with an editable inline caption (image)
	| 'caption';

/** caret stops of one textblock as document positions, ascending */
export type CaretStops = { readonly textblock: number; readonly positions: readonly number[] };

/** textblock = the position before it */
export type LineRef = { readonly textblock: number; readonly index: number };

export type LineGeometry = {
	readonly ref: LineRef;
	/** first and last caret stop */
	readonly from: number;
	readonly to: number;
	readonly top: number;
	readonly bottom: number;
	readonly baseline: number;
	/** the strut's content area */
	readonly textTop: number;
	readonly textBottom: number;
	/** drawn content, doc x */
	readonly left: number;
	readonly right: number;
	readonly hyphen: DocRect | null;
	readonly endExtension: number;
};

export type CursorKind =
	| 'text'
	| 'default'
	| 'pointer'
	| 'grab'
	| 'grabbing'
	| 'move'
	| 'crosshair'
	| 'col-resize'
	| 'nwse-resize'
	| 'nesw-resize'
	| 'ns-resize'
	| 'ew-resize'
	| 'e-resize'
	| 'w-resize';

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export type HitTarget =
	| { kind: 'text'; textblock: number }
	| { kind: 'leaf'; pos: number; policy: CaretPolicy }
	| { kind: 'formula'; pos: number; local: DocPoint; display: boolean }
	| { kind: 'island'; pos: number; offset: number }
	| { kind: 'cell'; cellPos: number; tablePos: number; inner: HitTarget }
	| { kind: 'between'; before: number | null; after: number | null }
	| { kind: 'margin'; side: 'left' | 'right' | 'above' | 'below' }
	// a FaceElement.anchor: list marker, macro call, handle
	| { kind: 'facePart'; pos: number; part: string }
	| { kind: 'handle'; pos: number; handle: ResizeHandle }
	// old words, gone blocks
	| { kind: 'widget'; key: string; pos: number; side: -1 | 1 };

export type DecorationHit = { from: number; to: number; attrs: Readonly<Record<string, string>>; spec: unknown };

export type CanvasHit = {
	/** prosemirror-view's posAtCoords pos */
	readonly pos: number;
	/** prosemirror-view's inside; -1 outside every top-level block */
	readonly inside: number;
	/** where Chromium would put the caret for this point */
	readonly caret: CaretPlace;
	readonly target: HitTarget;
	/** the hit FaceElement chain, innermost first; the inline hit chain for text */
	readonly chain: readonly FaceElement[];
	/** the computed cursor of the innermost element; auto -> text over editable text */
	readonly cursor: CursorKind;
	readonly marks: readonly Mark[];
	readonly decorations: readonly DecorationHit[];
	readonly hint: string | null;
};

export type CanvasGeometry = {
	/** any doc point; lays out the block under it on demand */
	hit(p: DocPoint): CanvasHit | null;
	caretRect(place: CaretPlace): DocRect | null;
	/** EditContext character bounds */
	charRects(from: number, to: number): DocRect[];
	rangeRects(from: number, to: number, reach: 'line' | 'text', all?: boolean): DocRect[];
	/** marginLeft: px from the border box out to where the node starts in its parent's flow */
	nodeRect(pos: number): { rect: DocRect; estimated: boolean; marginLeft?: number } | null;
	/** the innermost box under a doc point that scrolls sideways and has more to show: its element, its border box (doc
	 *  space) and the farthest it scrolls */
	scrollBoxAt(p: DocPoint): ScrollBoxAt | null;
	/** the innermost box holding a place that scrolls sideways, as scrollBoxAt gives it */
	scrollBoxOf(pos: number): ScrollBoxAt | null;
	partRect(pos: number, part: string): DocRect | null;
	rangeTop(pos: number): { y: number; estimated: boolean };
	lineOf(place: CaretPlace): LineGeometry | null;
	linesOf(textblock: number): readonly LineGeometry[];
	/** document order, crossing blocks, skipping caretless blocks */
	adjacentLine(line: LineRef, dir: -1 | 1): LineRef | null;
	/** Chromium's rule for a line move */
	placeOnLine(line: LineRef, x: number): CaretPlace;
	/** PageUp/PageDown, autoscroll */
	placeAt(p: DocPoint): CaretPlace | null;
	stopsOf(textblock: number): CaretStops;
	wordBoundary(place: CaretPlace, dir: -1 | 1, rule: 'previousStart' | 'nextStart' | 'nextEnd'): number;
	wordRange(place: CaretPlace): { from: number; to: number };
	directionAt(place: CaretPlace): 'ltr' | 'rtl';
	/** the direction of the textblock holding the place, whatever run the place is in */
	baseDirectionAt(place: CaretPlace): 'ltr' | 'rtl';
	/** null where the line holds no right-to-left text; `leaf`: place.pos is a selected inline leaf, left on that side */
	visualStep(place: CaretPlace, dir: -1 | 1, leaf?: boolean): VisualStep | null;
	visualWordStart(place: CaretPlace, dir: -1 | 1): VisualWordStart | null;
	endOfTextblock(dir: TextblockDirection, state: EditorState): boolean;
};
