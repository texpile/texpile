// every property a look may declare: CSS name, inheritance, initial computed value and how a declared value computes
import type { StyleLook, StyleProperty } from '../../contracts/styleTypes';
import { SHORTHANDS } from './shorthands';

/** value: lengths absolutized; string: as written; the rest compute by their own rule (declaredValues.ts) */
export type ValueKind = 'value' | 'string' | 'px' | 'lineWidth' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'color' | 'paintColor';
export type LonghandSpec = { readonly css: string; readonly inherited: boolean; readonly initial: string; readonly kind: ValueKind };

type Longhand = Exclude<StyleProperty, keyof typeof SHORTHANDS>;

function own(initial: string, kind: ValueKind = 'value'): Omit<LonghandSpec, 'css'> {
	return { inherited: false, initial, kind };
}

function inherited(initial: string, kind: ValueKind = 'value'): Omit<LonghandSpec, 'css'> {
	return { inherited: true, initial, kind };
}

const SPECS: Record<Longhand, Omit<LonghandSpec, 'css'>> = {
	display: own('inline'),
	position: own('static'),
	top: own('auto'),
	right: own('auto'),
	bottom: own('auto'),
	left: own('auto'),
	float: own('none'),
	clear: own('none'),
	boxSizing: own('content-box'),
	width: own('auto'),
	minWidth: own('auto'),
	maxWidth: own('none'),
	height: own('auto'),
	minHeight: own('auto'),
	maxHeight: own('none'),
	aspectRatio: own('auto'),
	marginTop: own('0px'),
	marginRight: own('0px'),
	marginBottom: own('0px'),
	marginLeft: own('0px'),
	paddingTop: own('0px'),
	paddingRight: own('0px'),
	paddingBottom: own('0px'),
	paddingLeft: own('0px'),
	borderTopWidth: own('3px', 'lineWidth'),
	borderRightWidth: own('3px', 'lineWidth'),
	borderBottomWidth: own('3px', 'lineWidth'),
	borderLeftWidth: own('3px', 'lineWidth'),
	borderTopStyle: own('none'),
	borderRightStyle: own('none'),
	borderBottomStyle: own('none'),
	borderLeftStyle: own('none'),
	borderTopColor: own('currentcolor', 'paintColor'),
	borderRightColor: own('currentcolor', 'paintColor'),
	borderBottomColor: own('currentcolor', 'paintColor'),
	borderLeftColor: own('currentcolor', 'paintColor'),
	borderTopLeftRadius: own('0px'),
	borderTopRightRadius: own('0px'),
	borderBottomRightRadius: own('0px'),
	borderBottomLeftRadius: own('0px'),
	overflowX: own('visible'),
	overflowY: own('visible'),
	textOverflow: own('clip'),
	webkitLineClamp: own('none'),
	transform: own('none'),
	translate: own('none'),
	rotate: own('none'),
	scale: own('none'),
	transformOrigin: own('50% 50%'),
	order: own('0'),
	visibility: inherited('visible'),
	zIndex: own('auto'),
	fontFamily: inherited('"Times New Roman"', 'string'),
	fontSize: inherited('16px', 'fontSize'),
	fontWeight: inherited('400', 'fontWeight'),
	fontStyle: inherited('normal'),
	fontVariantCaps: inherited('normal'),
	fontVariantLigatures: inherited('normal'),
	fontFeatureSettings: inherited('normal', 'string'),
	fontStretch: inherited('100%'),
	fontVariantNumeric: inherited('normal'),
	fontKerning: inherited('auto'),
	lineHeight: inherited('normal', 'lineHeight'),
	letterSpacing: inherited('0px', 'px'),
	wordSpacing: inherited('0px', 'px'),
	textIndent: inherited('0px'),
	textAlign: inherited('start'),
	textAlignLast: inherited('auto'),
	textTransform: inherited('none'),
	whiteSpaceCollapse: inherited('collapse'),
	textWrapMode: inherited('wrap'),
	overflowWrap: inherited('normal'),
	wordBreak: inherited('normal'),
	hyphens: inherited('manual'),
	verticalAlign: own('baseline'),
	direction: inherited('ltr'),
	writingMode: inherited('horizontal-tb'),
	flexDirection: own('row'),
	flexWrap: own('nowrap'),
	flexGrow: own('0'),
	flexShrink: own('1'),
	flexBasis: own('auto'),
	justifyContent: own('normal'),
	alignItems: own('normal'),
	alignSelf: own('auto'),
	alignContent: own('normal'),
	gridTemplateColumns: own('none'),
	gridTemplateRows: own('none'),
	gridAutoColumns: own('auto'),
	gridAutoRows: own('auto'),
	gridAutoFlow: own('row'),
	gridColumnStart: own('auto'),
	gridColumnEnd: own('auto'),
	gridRowStart: own('auto'),
	gridRowEnd: own('auto'),
	justifyItems: own('normal'),
	justifySelf: own('auto'),
	rowGap: own('normal'),
	columnGap: own('normal'),
	columnCount: own('auto'),
	columnFill: own('balance'),
	tableLayout: own('auto'),
	borderCollapse: inherited('separate'),
	borderSpacing: inherited('0px 0px'),
	captionSide: inherited('top'),
	emptyCells: inherited('show'),
	listStyleType: inherited('disc'),
	listStylePosition: inherited('outside'),
	color: inherited('rgb(0 0 0)', 'color'),
	backgroundColor: own('transparent', 'paintColor'),
	outlineStyle: own('none'),
	outlineWidth: own('3px', 'lineWidth'),
	outlineColor: own('currentcolor', 'paintColor'),
	outlineOffset: own('0px', 'px'),
	boxShadow: own('none'),
	opacity: own('1'),
	textDecorationLine: own('none'),
	textDecorationStyle: own('solid'),
	textDecorationColor: own('currentcolor', 'paintColor'),
	textDecorationThickness: own('auto'),
	textUnderlineOffset: own('auto'),
	cursor: inherited('auto'),
	pointerEvents: inherited('auto'),
	// Blink keeps user-select inherited, and the recordings show it
	userSelect: inherited('auto'),
	animationName: own('none', 'string'),
	animationDuration: own('0s'),
	animationDelay: own('0s'),
	animationTimingFunction: own('ease'),
	animationIterationCount: own('1'),
	animationDirection: own('normal'),
	animationFillMode: own('none'),
	animationPlayState: own('running'),
	transitionProperty: own('all', 'string'),
	transitionDuration: own('0s'),
	transitionDelay: own('0s'),
	transitionTimingFunction: own('ease'),
	caretColor: inherited('auto'),
	accentColor: inherited('auto')
};

/** the DOM's kebab-case name of a camelCase property */
export function cssNameOf(property: string): string {
	const kebab = property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
	return kebab.startsWith('webkit-') ? `-${kebab}` : kebab;
}

/** longhands in a fixed order: a computed style is one string per index */
export const LONGHANDS: readonly (LonghandSpec & { readonly name: Longhand })[] = (Object.keys(SPECS) as Longhand[]).map((name) => ({
	name,
	css: cssNameOf(name),
	...SPECS[name]
}));

export const LONGHAND_INDEX: ReadonlyMap<string, number> = new Map(
	LONGHANDS.flatMap((spec, i) => [[spec.name, i] as const, [spec.css, i] as const])
);

export function longhandIndex(name: Longhand): number {
	return LONGHAND_INDEX.get(name)!;
}

export function isShorthand(name: string): name is keyof typeof SHORTHANDS {
	return Object.hasOwn(SHORTHANDS, name);
}

export const SHORTHAND_BY_CSS: ReadonlyMap<string, keyof typeof SHORTHANDS> = new Map(
	(Object.keys(SHORTHANDS) as (keyof typeof SHORTHANDS)[]).map((name) => [cssNameOf(name), name])
);

function bordered(width: string): boolean {
	return width !== '0px';
}

/** a property the box's kind leaves unread reads '' (the mirror's gates), so equal looks of other kinds intern alike */
export const READ_ONLY_WHEN: readonly { gate: string; applies: (value: string) => boolean; properties: readonly string[] }[] = [
	{
		gate: 'display',
		applies: (display) => /flex|grid/.test(display),
		properties: ['flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'row-gap']
	},
	{
		gate: 'display',
		applies: (display) => display.includes('grid'),
		properties: ['grid-template-columns', 'grid-template-rows', 'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow', 'justify-items']
	},
	{
		gate: 'display',
		applies: (display) => display.includes('table'),
		properties: ['table-layout', 'border-collapse', 'border-spacing', 'caption-side', 'empty-cells']
	},
	{ gate: 'display', applies: (display) => display.includes('list-item'), properties: ['list-style-type', 'list-style-position'] },
	{ gate: 'position', applies: (position) => position !== 'static', properties: ['top', 'right', 'bottom', 'left'] },
	{ gate: 'overflow-x', applies: (overflow) => overflow !== 'visible', properties: ['text-overflow'] },
	...(['top', 'right', 'bottom', 'left'] as const).map((side) => ({
		gate: `border-${side}-width`,
		applies: bordered,
		properties: [`border-${side}-style`, `border-${side}-color`]
	})),
	{ gate: 'outline-style', applies: (style) => style !== 'none', properties: ['outline-width', 'outline-color', 'outline-offset'] },
	{
		gate: 'text-decoration-line',
		applies: (line) => line !== 'none',
		properties: ['text-decoration-style', 'text-decoration-color', 'text-decoration-thickness', 'text-underline-offset']
	},
	{ gate: 'column-count', applies: (count) => count !== 'auto', properties: ['column-fill'] },
	{
		gate: 'animation-name',
		applies: (name) => name !== 'none',
		properties: [
			'animation-duration',
			'animation-delay',
			'animation-timing-function',
			'animation-iteration-count',
			'animation-direction',
			'animation-fill-mode',
			'animation-play-state'
		]
	},
	{
		gate: 'transition-duration',
		applies: (duration) => /[1-9]/.test(duration),
		properties: ['transition-property', 'transition-delay', 'transition-timing-function']
	}
];

/** the longhands paint reads; the rest are the layout half */
export const PAINT_HALF: ReadonlySet<string> = new Set([
	...['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'color', 'backgroundColor'],
	...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius', 'boxShadow', 'opacity'],
	...['outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'textDecorationLine', 'textDecorationStyle'],
	...['textDecorationColor', 'textDecorationThickness', 'textUnderlineOffset', 'cursor', 'pointerEvents', 'userSelect'],
	...['animationName', 'animationDuration', 'animationDelay', 'animationTimingFunction', 'animationIterationCount'],
	...['animationDirection', 'animationFillMode', 'animationPlayState', 'transitionProperty', 'transitionDuration'],
	...['transitionDelay', 'transitionTimingFunction', 'caretColor', 'accentColor']
]);

/** declarations a canvas look can carry: custom properties and properties outside the canvas set are left out */
export function knownLook(declarations: Readonly<Record<string, string>>): StyleLook {
	return Object.fromEntries(Object.entries(declarations).filter(([name]) => LONGHAND_INDEX.has(name) || isShorthand(name))) as StyleLook;
}
