// computed longhand values, read by CSS name, parsed into the layout and paint halves layout and paint read
import type {
	BorderStyle,
	Display,
	Edges,
	FontSpec,
	LayoutStyle,
	Overflow,
	PaintStyle,
	Rgba,
	TextDecoration
} from '../../contracts/styleTypes';
import type { CursorKind } from '../../contracts/geometryTypes';
import { parseColor, TRANSPARENT } from './colorValue';
import {
	animationRef,
	lengthOr,
	lineHeightPx,
	oneOf,
	parseLength,
	px,
	radius,
	shadows,
	splitValue,
	stretchKeyword,
	transformStyle,
	transitionRefs,
	verticalAlign,
	whiteSpace,
	ZERO_LENGTH
} from './cssValues';

/** Chromium's computed border width: whole device pixels, a hairline under one device pixel kept at one */
function deviceBorder(width: number): number {
	const dpr = globalThis.devicePixelRatio || 1;
	if (width <= 0) return 0;
	return Math.max(1, Math.floor(width * dpr)) / dpr;
}

export type ReadProperty = (property: string) => string;

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const BORDER_STYLES: readonly BorderStyle[] = [
	'none',
	'hidden',
	'solid',
	'dashed',
	'dotted',
	'double',
	'groove',
	'ridge',
	'inset',
	'outset'
];
const OVERFLOWS: readonly Overflow[] = ['visible', 'hidden', 'clip', 'auto', 'scroll'];
const CURSORS: readonly CursorKind[] = [
	'text',
	'default',
	'pointer',
	'grab',
	'grabbing',
	'move',
	'crosshair',
	'col-resize',
	'nwse-resize',
	'nesw-resize',
	'ns-resize',
	'ew-resize',
	'e-resize',
	'w-resize'
];
const DISPLAYS: readonly Display[] = [
	'none',
	'contents',
	'block',
	'inline',
	'inline-block',
	'flow-root',
	'list-item',
	'flex',
	'inline-flex',
	'grid',
	'inline-grid',
	'table',
	'inline-table',
	'table-caption',
	'table-row-group',
	'table-header-group',
	'table-footer-group',
	'table-row',
	'table-cell',
	'table-column',
	'table-column-group'
];
const DISPLAY_SET: ReadonlySet<string> = new Set(DISPLAYS);
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

function edges<T>(read: (side: (typeof SIDES)[number]) => T): Edges<T> {
	return { top: read('top'), right: read('right'), bottom: read('bottom'), left: read('left') };
}

/** 'block flow' and 'inline flow-root' as the one keyword the engine dispatches on */
function displayOf(value: string): Display {
	if (DISPLAY_SET.has(value)) return value as Display;
	const words = value.split(/\s+/);
	if (words.includes('list-item')) return 'list-item';
	if (words[0] === 'inline' && words[1] === 'flow-root') return 'inline-block';
	if (words[0] === 'inline' && words[1]) return DISPLAYS.find((d) => d === `inline-${words[1]}`) ?? 'inline';
	return DISPLAYS.find((d) => d === words[1]) ?? 'block';
}

function textAlignOf(value: string): string {
	const bare = value.startsWith('-webkit-') ? value.slice('-webkit-'.length) : value;
	return bare === 'auto' ? 'start' : bare;
}

function fontOf(read: ReadProperty): FontSpec {
	const style = read('font-style');
	const caps = read('font-variant-caps');
	const ligatures = read('font-variant-ligatures');
	const features = read('font-feature-settings');
	return {
		families: read('font-family'),
		sizePx: px(read('font-size'), 16),
		weight: px(read('font-weight'), 400),
		style: style.startsWith('oblique') ? 'oblique' : style === 'italic' ? 'italic' : 'normal',
		caps: oneOf(caps, ['normal', 'small-caps', 'all-small-caps'], 'normal'),
		stretch: stretchKeyword(read('font-stretch')),
		numeric: read('font-variant-numeric').includes('tabular-nums') ? 'tabular-nums' : 'normal',
		ligatures: ligatures !== 'none' && (features === 'normal' || !/["']liga["'] 0/.test(features)),
		kerning: oneOf(read('font-kerning'), ['auto', 'normal', 'none'], 'auto')
	};
}

/** a multicolumn container's normal gap is 1em */
function columnGapOf(value: string, count: string, fontSize: string): LayoutStyle['gap']['row'] {
	return value === 'normal' && count !== 'auto' && count ? { px: parseFloat(fontSize) || 16, percent: 0 } : gapOf(value);
}

function gapOf(value: string): LayoutStyle['gap']['row'] {
	return value === 'normal' ? ZERO_LENGTH : (parseLength(value) ?? ZERO_LENGTH);
}

type BoxPart = Pick<
	LayoutStyle,
	| 'display'
	| 'position'
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
	| 'padding'
	| 'borderWidth'
	| 'borderStyle'
	| 'overflowX'
	| 'overflowY'
	| 'textOverflow'
	| 'lineClamp'
	| 'transform'
	| 'order'
	| 'visibility'
	| 'zIndex'
>;
type TextPart = Omit<LayoutStyle, keyof BoxPart | keyof ContainerPart>;
type ContainerPart = Pick<LayoutStyle, 'flex' | 'grid' | 'gap' | 'columns' | 'table' | 'listStyle'>;

export function boxOf(read: ReadProperty): BoxPart {
	const clamp = read('-webkit-line-clamp');
	const zIndex = read('z-index');
	const aspect = read('aspect-ratio');
	const ratio = aspect === 'auto' ? null : (/(-?[\d.]+)\s*\/\s*(-?[\d.]+)\s*$/.exec(aspect) ?? /^(?:auto\s+)?(-?[\d.]+)$/.exec(aspect));
	const position = read('position');
	return {
		display: displayOf(read('display')),
		position:
			position === 'absolute' || position === 'fixed'
				? 'absolute'
				: position === 'relative' || position === 'sticky'
					? 'relative'
					: 'static',
		inset: edges((side) => lengthOr(read(side), ['auto'], 'auto')),
		float: oneOf(read('float'), ['none', 'left', 'right'], 'none'),
		clear: oneOf(read('clear'), ['none', 'left', 'right', 'both'], 'none'),
		boxSizing: oneOf(read('box-sizing'), ['content-box', 'border-box'], 'content-box'),
		width: lengthOr(read('width'), ['auto', 'min-content', 'max-content', 'fit-content'], 'auto'),
		minWidth: lengthOr(read('min-width'), ['auto'], 'auto'),
		maxWidth: lengthOr(read('max-width'), ['none'], 'none'),
		height: lengthOr(read('height'), ['auto'], 'auto'),
		minHeight: lengthOr(read('min-height'), ['auto'], 'auto'),
		maxHeight: lengthOr(read('max-height'), ['none'], 'none'),
		aspectRatio: ratio ? parseFloat(ratio[1]) / (ratio[2] ? parseFloat(ratio[2]) : 1) : null,
		margin: edges((side) => lengthOr(read(`margin-${side}`), ['auto'])),
		padding: edges((side) => parseLength(read(`padding-${side}`)) ?? ZERO_LENGTH),
		borderWidth: edges((side) => deviceBorder(px(read(`border-${side}-width`)))),
		borderStyle: edges((side) => oneOf(read(`border-${side}-style`), BORDER_STYLES, 'none')),
		overflowX: oneOf(read('overflow-x'), OVERFLOWS, 'visible'),
		overflowY: oneOf(read('overflow-y'), OVERFLOWS, 'visible'),
		textOverflow: read('text-overflow') === 'ellipsis' ? 'ellipsis' : 'clip',
		lineClamp: !clamp || clamp === 'none' ? null : parseInt(clamp, 10),
		transform: transformStyle(read('transform'), read('translate'), read('rotate'), read('scale'), read('transform-origin')),
		order: parseInt(read('order'), 10) || 0,
		visibility: read('visibility') === 'visible' ? 'visible' : 'hidden',
		zIndex: zIndex === 'auto' || !zIndex ? 'auto' : parseInt(zIndex, 10)
	};
}

export function textOf(read: ReadProperty): TextPart {
	const font = fontOf(read);
	return {
		font,
		lineHeight: lineHeightPx(read('line-height'), font.sizePx),
		letterSpacing: px(read('letter-spacing')),
		wordSpacing: px(read('word-spacing')),
		textIndent: parseLength(read('text-indent')) ?? ZERO_LENGTH,
		textAlign: oneOf(textAlignOf(read('text-align')), ['start', 'left', 'right', 'center', 'justify', 'end'], 'start'),
		textAlignLast: read('text-align-last') || 'auto',
		textTransform: oneOf(read('text-transform'), ['none', 'uppercase', 'lowercase', 'capitalize'], 'none'),
		whiteSpace: whiteSpace(read('white-space'), read('white-space-collapse'), read('text-wrap-mode')),
		overflowWrap: oneOf(read('overflow-wrap'), ['normal', 'break-word', 'anywhere'], 'normal'),
		wordBreak: oneOf(read('word-break'), ['normal', 'break-all', 'keep-all', 'break-word'], 'normal'),
		hyphens: oneOf(read('hyphens') || read('-webkit-hyphens'), ['none', 'manual', 'auto'], 'manual'),
		verticalAlign: verticalAlign(read('vertical-align')),
		direction: read('direction') === 'rtl' ? 'rtl' : 'ltr',
		writingMode: read('writing-mode').startsWith('vertical') ? 'vertical-rl' : 'horizontal-tb'
	};
}

export function containerOf(read: ReadProperty): ContainerPart {
	const columnCount = read('column-count');
	const borderSpacing = read('border-spacing');
	const spacing = borderSpacing ? splitValue(borderSpacing, ' ').map((v) => px(v)) : [];
	return {
		flex: {
			direction: oneOf(read('flex-direction'), ['row', 'row-reverse', 'column', 'column-reverse'], 'row'),
			wrap: oneOf(read('flex-wrap'), ['nowrap', 'wrap', 'wrap-reverse'], 'nowrap'),
			grow: px(read('flex-grow')),
			shrink: px(read('flex-shrink'), 1),
			basis: lengthOr(read('flex-basis'), ['auto', 'content'], 'auto'),
			justifyContent: read('justify-content') || 'normal',
			alignItems: read('align-items') || 'normal',
			alignSelf: read('align-self') || 'auto',
			alignContent: read('align-content') || 'normal'
		},
		grid: {
			templateColumns: read('grid-template-columns') || 'none',
			templateRows: read('grid-template-rows') || 'none',
			autoColumns: read('grid-auto-columns') || 'auto',
			autoRows: read('grid-auto-rows') || 'auto',
			autoFlow: read('grid-auto-flow') || 'row',
			column: { start: read('grid-column-start') || 'auto', end: read('grid-column-end') || 'auto' },
			row: { start: read('grid-row-start') || 'auto', end: read('grid-row-end') || 'auto' },
			justifyItems: read('justify-items') || 'normal',
			justifySelf: read('justify-self') || 'auto'
		},
		gap: { row: gapOf(read('row-gap')), column: gapOf(read('column-gap')) },
		columns: {
			count: columnCount === 'auto' || !columnCount ? null : parseInt(columnCount, 10),
			gap: columnGapOf(read('column-gap'), columnCount, read('font-size')),
			fill: read('column-fill') === 'auto' ? 'auto' : 'balance'
		},
		table: {
			layout: read('table-layout') === 'fixed' ? 'fixed' : 'auto',
			borderCollapse: read('border-collapse') === 'collapse' ? 'collapse' : 'separate',
			borderSpacing: { horizontal: spacing[0] ?? 0, vertical: spacing[1] ?? spacing[0] ?? 0 },
			captionSide: read('caption-side') === 'bottom' ? 'bottom' : 'top',
			emptyCells: read('empty-cells') === 'hide' ? 'hide' : 'show'
		},
		listStyle: { type: read('list-style-type') || 'disc', position: read('list-style-position') === 'inside' ? 'inside' : 'outside' }
	};
}

function decorationOf(read: ReadProperty, color: Rgba): TextDecoration {
	const thickness = read('text-decoration-thickness');
	const offset = read('text-underline-offset');
	const lines = read('text-decoration-line') || read('-webkit-text-decoration-line');
	return {
		lines: (['underline', 'overline', 'line-through'] as const).filter((line) => lines.includes(line)),
		style: oneOf(read('text-decoration-style'), ['solid', 'double', 'dotted', 'dashed', 'wavy'], 'solid'),
		color: parseColor(read('text-decoration-color'), color) ?? color,
		thickness: thickness === 'auto' || thickness === 'from-font' ? thickness : thickness ? px(thickness) : 'auto',
		underlineOffset: !offset || offset === 'auto' ? 'auto' : px(offset)
	};
}

export function paintOf(read: ReadProperty): PaintStyle {
	const color = parseColor(read('color')) ?? BLACK;
	function colorOf(property: string): Rgba {
		return parseColor(read(property), color) ?? TRANSPARENT;
	}
	const outlineStyle = oneOf(read('outline-style'), BORDER_STYLES, 'none');
	const outlineWidth = px(read('outline-width'));
	const cursor = read('cursor');
	const caret = read('caret-color');
	const accent = read('accent-color');
	const userSelect = read('user-select') || read('-webkit-user-select');
	return {
		color,
		backgroundColor: colorOf('background-color'),
		borderColor: edges((side) => colorOf(`border-${side}-color`)),
		borderRadius: {
			tl: radius(read('border-top-left-radius')),
			tr: radius(read('border-top-right-radius')),
			br: radius(read('border-bottom-right-radius')),
			bl: radius(read('border-bottom-left-radius'))
		},
		outline:
			outlineStyle === 'none' || outlineWidth <= 0
				? null
				: { width: outlineWidth, style: outlineStyle, color: colorOf('outline-color'), offset: px(read('outline-offset')) },
		boxShadow: shadows(read('box-shadow'), color),
		opacity: px(read('opacity'), 1),
		textDecoration: decorationOf(read, color),
		cursor: cursor === 'auto' ? 'auto' : (CURSORS.find((c) => c === cursor) ?? 'default'),
		pointerEvents: read('pointer-events') === 'none' ? 'none' : 'auto',
		userSelect: oneOf(userSelect, ['auto', 'none', 'text', 'all'], 'auto'),
		animation: animationRef(read),
		transition: transitionRefs(read),
		caretColor: caret === 'auto' || !caret ? 'auto' : (parseColor(caret, color) ?? 'auto'),
		accentColor: accent === 'auto' || !accent ? 'auto' : (parseColor(accent, color) ?? 'auto')
	};
}
