import type { TokenName } from '../style/theme/tokenList';
import type { FaceElement } from '../tree/faceElement';
import type { CursorKind } from './geometryTypes';

/** a calc() of px and % reduces to this */
export type Length = { px: number; percent: number };
export type LengthOr<K extends string> = Length | K;
export type Edges<T> = { top: T; right: T; bottom: T; left: T };
export type Corners<T> = { tl: T; tr: T; br: T; bl: T };
/** sRGB, 0 to 1; '' never reaches the canvas */
export type Rgba = { r: number; g: number; b: number; a: number };

export type FontSpec = {
	families: string;
	sizePx: number;
	weight: number;
	style: 'normal' | 'italic' | 'oblique';
	caps: 'normal' | 'small-caps' | 'all-small-caps';
	stretch: string;
	numeric: 'normal' | 'tabular-nums';
	ligatures: boolean;
	kerning: 'auto' | 'normal' | 'none';
};

export type Display =
	| 'none'
	| 'contents'
	| 'block'
	| 'inline'
	| 'inline-block'
	| 'flow-root'
	| 'list-item'
	| 'flex'
	| 'inline-flex'
	| 'grid'
	| 'inline-grid'
	| 'table'
	| 'inline-table'
	| 'table-caption'
	| 'table-row-group'
	| 'table-header-group'
	| 'table-footer-group'
	| 'table-row'
	| 'table-cell'
	| 'table-column'
	| 'table-column-group';
export type BorderStyle = 'none' | 'hidden' | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset';
export type Overflow = 'visible' | 'hidden' | 'clip' | 'auto' | 'scroll';
export type VerticalAlign = 'baseline' | 'sub' | 'super' | 'middle' | 'top' | 'bottom' | 'text-top' | 'text-bottom' | Length;

export type FlexStyle = {
	direction: 'row' | 'row-reverse' | 'column' | 'column-reverse';
	wrap: 'nowrap' | 'wrap' | 'wrap-reverse';
	grow: number;
	shrink: number;
	basis: LengthOr<'auto' | 'content'>;
	/** computed keywords as Chrome returns them ('safe center', 'space-between', 'normal') */
	justifyContent: string;
	alignItems: string;
	alignSelf: string;
	alignContent: string;
};

/** computed track and placement strings; gridTracks.ts parses them */
export type GridStyle = {
	templateColumns: string;
	templateRows: string;
	autoColumns: string;
	autoRows: string;
	autoFlow: string;
	column: { start: string; end: string };
	row: { start: string; end: string };
	justifyItems: string;
	justifySelf: string;
};

export type TableStyle = {
	layout: 'auto' | 'fixed';
	borderCollapse: 'separate' | 'collapse';
	borderSpacing: { horizontal: number; vertical: number };
	captionSide: 'top' | 'bottom';
	emptyCells: 'show' | 'hide';
};

/** the transform and translate properties combined; % resolves against the border box at layout */
export type TransformStyle = {
	translate: { x: Length; y: Length };
	/** degrees */
	rotate: number;
	scale: { x: number; y: number };
	origin: { x: Length; y: Length };
};

export type Shadow = { x: number; y: number; blur: number; spread: number; color: Rgba; inset: boolean };
export type TextDecoration = {
	lines: readonly ('underline' | 'overline' | 'line-through')[];
	style: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';
	color: Rgba;
	thickness: number | 'auto' | 'from-font';
	underlineOffset: number | 'auto';
};
export type AnimationRef = {
	name: string;
	durationMs: number;
	delayMs: number;
	timing: string;
	iterations: number;
	direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
	fillMode: 'none' | 'forwards' | 'backwards' | 'both';
	playState: 'running' | 'paused';
};
export type TransitionRef = { property: string; durationMs: number; delayMs: number; timing: string };

export type LayoutStyle = {
	display: Display;
	position: 'static' | 'relative' | 'absolute';
	inset: Edges<LengthOr<'auto'>>;
	float: 'none' | 'left' | 'right';
	clear: 'none' | 'left' | 'right' | 'both';
	boxSizing: 'content-box' | 'border-box';
	width: LengthOr<'auto' | 'min-content' | 'max-content' | 'fit-content'>;
	minWidth: LengthOr<'auto'>;
	maxWidth: LengthOr<'none'>;
	height: LengthOr<'auto'>;
	minHeight: LengthOr<'auto'>;
	maxHeight: LengthOr<'none'>;
	aspectRatio: number | null;
	margin: Edges<LengthOr<'auto'>>;
	padding: Edges<Length>;
	borderWidth: Edges<number>;
	borderStyle: Edges<BorderStyle>;
	font: FontSpec;
	lineHeight: number | 'normal';
	letterSpacing: number;
	wordSpacing: number;
	textIndent: Length;
	textAlign: 'start' | 'left' | 'right' | 'center' | 'justify' | 'end';
	textAlignLast: string;
	textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
	whiteSpace: 'normal' | 'nowrap' | 'pre' | 'pre-wrap' | 'pre-line' | 'break-spaces';
	overflowWrap: 'normal' | 'break-word' | 'anywhere';
	wordBreak: 'normal' | 'break-all' | 'keep-all' | 'break-word';
	hyphens: 'none' | 'manual' | 'auto';
	verticalAlign: VerticalAlign;
	direction: 'ltr' | 'rtl';
	writingMode: 'horizontal-tb' | 'vertical-rl';
	flex: FlexStyle;
	grid: GridStyle;
	gap: { row: Length; column: Length };
	columns: { count: number | null; gap: Length; fill: 'balance' | 'auto' };
	table: TableStyle;
	overflowX: Overflow;
	overflowY: Overflow;
	textOverflow: 'clip' | 'ellipsis';
	lineClamp: number | null;
	listStyle: { type: string; position: 'inside' | 'outside' };
	transform: TransformStyle | null;
	order: number;
	visibility: 'visible' | 'hidden';
	zIndex: number | 'auto';
};

export type PaintStyle = {
	color: Rgba;
	backgroundColor: Rgba;
	borderColor: Edges<Rgba>;
	borderRadius: Corners<number>;
	outline: { width: number; style: BorderStyle; color: Rgba; offset: number } | null;
	boxShadow: readonly Shadow[];
	opacity: number;
	textDecoration: TextDecoration;
	/** auto resolves to text over editable text (11.7) */
	cursor: CursorKind | 'auto';
	pointerEvents: 'auto' | 'none';
	userSelect: 'auto' | 'none' | 'text' | 'all';
	animation: AnimationRef | null;
	transition: readonly TransitionRef[];
	caretColor: Rgba | 'auto';
	accentColor: Rgba | 'auto';
};

export type ComputedStyle = {
	readonly id: number;
	readonly layoutId: number;
	readonly paintId: number;
	readonly layout: LayoutStyle;
	readonly paint: PaintStyle;
};

/** one level of a text run's style chain: a mark's toDOM, an inline decoration's merged attrs, a code token class */
export type RunChainLevel = {
	readonly tag: string;
	readonly classes: readonly string[];
	readonly attrs: Readonly<Record<string, string>>;
	/** the decoration span under the pointer resolves its :hover rules through the state twins */
	readonly hovered: boolean;
	/** the level's declared style over its tag's base: a mark view's look, a decoration's or token's look */
	readonly look?: StyleLook;
	/** applied over look while hovered */
	readonly hoverLook?: StyleLook;
};
export type RunChain = { readonly key: string; readonly levels: readonly RunChainLevel[] };

export type RunStyle = {
	readonly id: number;
	/** equal keys lay out the same: font, spacing, inline edges, vertical align, text transform */
	readonly layoutKey: number;
	readonly paintKey: number;
	readonly font: FontSpec;
	/** the canvas font string (fontStrings.ts) */
	readonly fontString: string;
	readonly letterSpacing: number;
	readonly wordSpacing: number;
	readonly textTransform: LayoutStyle['textTransform'];
	readonly verticalAlign: VerticalAlign;
	/** inline padding plus border at the two ends of the whole run */
	readonly edges: { start: number; end: number };
	/** the innermost level's padding plus border above and below its text: an inline box draws them outside the line */
	readonly blockEdges?: { top: number; bottom: number };
	readonly paint: PaintStyle;
	/** px down from the run's own baseline by relative positioning along the chain (preflight's sup and sub) */
	readonly shift?: number;
	/** the innermost level's line-height in px, for the inline box's own half leading */
	readonly lineHeight?: number | 'normal';
	/** the innermost level's bottom border, which a paint-only decoration draws under its text */
	readonly bottomBorder?: { readonly width: number; readonly style: BorderStyle; readonly color: Rgba };
};

/** the properties a look may declare: those layout and paint read, plus the shorthands the base and views write */
export type StyleProperty =
	| 'display'
	| 'position'
	| 'top'
	| 'right'
	| 'bottom'
	| 'left'
	| 'inset'
	| 'float'
	| 'clear'
	| 'boxSizing'
	| 'width'
	| 'minWidth'
	| 'maxWidth'
	| 'height'
	| 'minHeight'
	| 'maxHeight'
	| 'aspectRatio'
	| 'margin'
	| 'marginTop'
	| 'marginRight'
	| 'marginBottom'
	| 'marginLeft'
	| 'padding'
	| 'paddingTop'
	| 'paddingRight'
	| 'paddingBottom'
	| 'paddingLeft'
	| 'border'
	| 'borderTop'
	| 'borderRight'
	| 'borderBottom'
	| 'borderLeft'
	| 'borderWidth'
	| 'borderTopWidth'
	| 'borderRightWidth'
	| 'borderBottomWidth'
	| 'borderLeftWidth'
	| 'borderStyle'
	| 'borderTopStyle'
	| 'borderRightStyle'
	| 'borderBottomStyle'
	| 'borderLeftStyle'
	| 'borderColor'
	| 'borderTopColor'
	| 'borderRightColor'
	| 'borderBottomColor'
	| 'borderLeftColor'
	| 'borderRadius'
	| 'borderTopLeftRadius'
	| 'borderTopRightRadius'
	| 'borderBottomRightRadius'
	| 'borderBottomLeftRadius'
	| 'overflow'
	| 'overflowX'
	| 'overflowY'
	| 'textOverflow'
	| 'webkitLineClamp'
	| 'transform'
	| 'translate'
	| 'rotate'
	| 'scale'
	| 'transformOrigin'
	| 'order'
	| 'visibility'
	| 'zIndex'
	| 'font'
	| 'fontFamily'
	| 'fontSize'
	| 'fontWeight'
	| 'fontStyle'
	| 'fontVariantCaps'
	| 'fontVariantLigatures'
	| 'fontFeatureSettings'
	| 'fontStretch'
	| 'fontVariantNumeric'
	| 'fontKerning'
	| 'lineHeight'
	| 'letterSpacing'
	| 'wordSpacing'
	| 'textIndent'
	| 'textAlign'
	| 'textAlignLast'
	| 'textTransform'
	| 'whiteSpace'
	| 'whiteSpaceCollapse'
	| 'textWrapMode'
	| 'overflowWrap'
	| 'wordBreak'
	| 'hyphens'
	| 'verticalAlign'
	| 'direction'
	| 'writingMode'
	| 'flex'
	| 'flexDirection'
	| 'flexWrap'
	| 'flexGrow'
	| 'flexShrink'
	| 'flexBasis'
	| 'justifyContent'
	| 'alignItems'
	| 'alignSelf'
	| 'alignContent'
	| 'gridTemplateColumns'
	| 'gridTemplateRows'
	| 'gridAutoColumns'
	| 'gridAutoRows'
	| 'gridAutoFlow'
	| 'gridColumn'
	| 'gridRow'
	| 'gridColumnStart'
	| 'gridColumnEnd'
	| 'gridRowStart'
	| 'gridRowEnd'
	| 'justifyItems'
	| 'justifySelf'
	| 'gap'
	| 'rowGap'
	| 'columnGap'
	| 'columnCount'
	| 'columnFill'
	| 'tableLayout'
	| 'borderCollapse'
	| 'borderSpacing'
	| 'captionSide'
	| 'emptyCells'
	| 'listStyle'
	| 'listStyleType'
	| 'listStylePosition'
	| 'color'
	| 'backgroundColor'
	| 'outline'
	| 'outlineStyle'
	| 'outlineWidth'
	| 'outlineColor'
	| 'outlineOffset'
	| 'boxShadow'
	| 'opacity'
	| 'textDecoration'
	| 'textDecorationLine'
	| 'textDecorationStyle'
	| 'textDecorationColor'
	| 'textDecorationThickness'
	| 'textUnderlineOffset'
	| 'cursor'
	| 'pointerEvents'
	| 'userSelect'
	| 'animationName'
	| 'animationDuration'
	| 'animationDelay'
	| 'animationTimingFunction'
	| 'animationIterationCount'
	| 'animationDirection'
	| 'animationFillMode'
	| 'animationPlayState'
	| 'transitionProperty'
	| 'transitionDuration'
	| 'transitionDelay'
	| 'transitionTimingFunction'
	| 'caretColor'
	| 'accentColor';

/** declared CSS as a node view writes it on el.style: property names and value strings as in the DOM */
export type StyleLook = Readonly<Partial<Record<StyleProperty, string>>>;
export type ElementState = 'hover' | 'focusWithin' | 'active';
/** a custom property on the token list */
export type ThemeToken = TokenName;

/** an inline decoration's look, given by its producer (spec.canvasLook) or registered for a third-party class */
export type DecorationLook = {
	readonly look: StyleLook;
	readonly hover?: StyleLook;
	/** line: the fill reaches the line box (pm-range-text); text: it hugs the content area */
	readonly reach?: 'line' | 'text';
};

/** declared looks, the core base and inheritance resolved into what layout and paint read */
export type CanvasStyles = {
	styleOf(el: FaceElement, pseudo?: 'before' | 'after' | 'marker'): ComputedStyle | null;
	runStyle(block: FaceElement, chain: RunChain): RunStyle;
	setState(el: FaceElement, state: ElementState, on: boolean): void;
	token(name: ThemeToken): Rgba;
	readonly epoch: number;
	/** bumped by a change of colors only */
	readonly paintEpoch: number;
};

/** the core's own looks (plan 2.4): what an element wears under its view's declared style */
export type StyleBase = {
	/** the editor root: .ProseMirror and the page view sheet */
	root(): StyleLook;
	/** UA and preflight defaults by lower-case tag */
	tag(tag: string): StyleLook | null;
	/** a core node type's look in its context; asked on every styleOf, so it keeps its own cache */
	node(el: FaceElement): StyleLook | null;
	/** worn by a selected node's dom while the default selectNode holds it */
	selectedNode(el: FaceElement): StyleLook | null;
};

/** a theme token's declared text, currentColor kept ('color-mix(in oklab, currentColor 60%, transparent)'); null: not a token */
export type ThemeTokenText = (name: ThemeToken) => string | null;
