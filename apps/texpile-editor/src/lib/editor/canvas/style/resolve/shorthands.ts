// shorthands into their longhands; a CSS-wide keyword reaches every longhand, an omitted part takes its initial value
import type { StyleProperty } from '../../contracts/styleTypes';
import { splitValue } from './cssValues';

export type LonghandValues = readonly (readonly [StyleProperty, string])[];
type Shorthand = { readonly longhands: readonly StyleProperty[]; expand(value: string): LonghandValues };

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
const BORDER_STYLES = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
const LINE_WIDTHS = new Set(['thin', 'medium', 'thick']);

/** 1 to 4 values to top, right, bottom, left */
function boxSides(parts: readonly string[]): [string, string, string, string] {
	const [top, right = top, bottom = top, left = right] = parts;
	return [top, right, bottom, left];
}

function sides(name: (side: (typeof SIDES)[number]) => StyleProperty): Shorthand {
	const longhands = SIDES.map(name);
	return {
		longhands,
		expand: (value) => {
			const values = boxSides(splitValue(value, ' '));
			return longhands.map((longhand, i) => [longhand, values[i]] as const);
		}
	};
}

function isLength(token: string): boolean {
	return /^-?[\d.]/.test(token) || /^calc\(/i.test(token) || LINE_WIDTHS.has(token);
}

/** width, style and color in any order */
function lineParts(value: string): { width: string; style: string; color: string } {
	const found = { width: 'medium', style: 'none', color: 'currentcolor' };
	for (const token of splitValue(value, ' ')) {
		if (BORDER_STYLES.has(token)) found.style = token;
		else if (isLength(token)) found.width = token;
		else found.color = token;
	}
	return found;
}

function borderSide(side: (typeof SIDES)[number]): Shorthand {
	const longhands = [`border${side}Width`, `border${side}Style`, `border${side}Color`] as StyleProperty[];
	return {
		longhands,
		expand: (value) => {
			const { width, style, color } = lineParts(value);
			return [
				[longhands[0], width],
				[longhands[1], style],
				[longhands[2], color]
			];
		}
	};
}

const BORDER_SIDES = SIDES.map(borderSide);

const FONT_SIZE_KEYWORDS = /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/;
const FONT_LONGHANDS: readonly StyleProperty[] = [
	'fontStyle',
	'fontVariantCaps',
	'fontWeight',
	'fontStretch',
	'fontSize',
	'lineHeight',
	'fontFamily',
	'fontVariantLigatures',
	'fontVariantNumeric',
	'fontKerning',
	'fontFeatureSettings'
];

const ANGLE = /^-?[\d.]+(deg|grad|rad|turn)$/i;

/** a bare number before the size is a weight, and an angle belongs to oblique */
function isFontSize(token: string): boolean {
	const size = token.split('/')[0];
	if (/^calc\(/i.test(size) || FONT_SIZE_KEYWORDS.test(size)) return true;
	return /^-?[\d.]/.test(size) && !/^\d+$/.test(token) && !ANGLE.test(size);
}

/** [style] [small-caps] [weight] [stretch] size[/line-height] family */
function fontParts(value: string): LonghandValues {
	const tokens = splitValue(value.replace(/\s*\/\s*/g, '/'), ' ');
	const found = new Map<StyleProperty, string>(FONT_LONGHANDS.map((name) => [name, 'normal']));
	found.set('fontWeight', '400').set('fontStretch', '100%').set('fontKerning', 'auto');
	const sizeAt = tokens.findIndex(isFontSize);
	for (const token of tokens.slice(0, Math.max(0, sizeAt))) {
		if (token === 'italic' || token.startsWith('oblique')) found.set('fontStyle', token);
		else if (ANGLE.test(token)) found.set('fontStyle', `${found.get('fontStyle')} ${token}`);
		else if (token === 'small-caps') found.set('fontVariantCaps', token);
		else if (/^(bold|bolder|lighter|\d+)$/.test(token)) found.set('fontWeight', token);
		else if (token !== 'normal') found.set('fontStretch', token);
	}
	const [size, lineHeight] = (tokens[sizeAt] ?? 'medium').split('/');
	found.set('fontSize', size);
	if (lineHeight) found.set('lineHeight', lineHeight);
	found.set('fontFamily', tokens.slice(sizeAt + 1).join(' '));
	return [...found];
}

const DECORATION_LINES = /^(underline|overline|line-through|none)$/;

/** 'start / end', the end omitted meaning auto */
function gridLine(start: StyleProperty, end: StyleProperty): Shorthand {
	return {
		longhands: [start, end],
		expand: (value) => {
			const [from, to = 'auto'] = value.split('/').map((part) => part.trim());
			return [
				[start, from || 'auto'],
				[end, to || 'auto']
			];
		}
	};
}

export const SHORTHANDS = {
	margin: sides((side) => `margin${side}`),
	padding: sides((side) => `padding${side}`),
	inset: sides((side) => side.toLowerCase() as StyleProperty),
	borderWidth: sides((side) => `border${side}Width`),
	borderStyle: sides((side) => `border${side}Style`),
	borderColor: sides((side) => `border${side}Color`),
	borderRadius: {
		longhands: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
		expand: (value) => {
			const values = boxSides(splitValue(value.split('/')[0], ' '));
			return (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'] as const).map(
				(longhand, i) => [longhand, values[i]] as const
			);
		}
	},
	borderTop: BORDER_SIDES[0],
	borderRight: BORDER_SIDES[1],
	borderBottom: BORDER_SIDES[2],
	borderLeft: BORDER_SIDES[3],
	border: {
		longhands: BORDER_SIDES.flatMap((side) => side.longhands),
		expand: (value) => BORDER_SIDES.flatMap((side) => side.expand(value))
	},
	outline: {
		longhands: ['outlineWidth', 'outlineStyle', 'outlineColor'],
		expand: (value) => {
			const { width, style, color } = lineParts(value);
			return [
				['outlineWidth', width],
				['outlineStyle', style],
				['outlineColor', color]
			];
		}
	},
	overflow: {
		longhands: ['overflowX', 'overflowY'],
		expand: (value) => {
			const [x, y = x] = splitValue(value, ' ');
			return [
				['overflowX', x],
				['overflowY', y]
			];
		}
	},
	gap: {
		longhands: ['rowGap', 'columnGap'],
		expand: (value) => {
			const [row, column = row] = splitValue(value, ' ');
			return [
				['rowGap', row],
				['columnGap', column]
			];
		}
	},
	gridColumn: gridLine('gridColumnStart', 'gridColumnEnd'),
	gridRow: gridLine('gridRowStart', 'gridRowEnd'),
	flex: {
		longhands: ['flexGrow', 'flexShrink', 'flexBasis'],
		expand: (value) => {
			const [grow, shrink, basis] = flexParts(value);
			return [
				['flexGrow', grow],
				['flexShrink', shrink],
				['flexBasis', basis]
			];
		}
	},
	font: { longhands: FONT_LONGHANDS, expand: fontParts },
	textDecoration: {
		longhands: ['textDecorationLine', 'textDecorationStyle', 'textDecorationColor', 'textDecorationThickness'],
		expand: (value) => {
			const lines: string[] = [];
			const found = new Map<StyleProperty, string>([
				['textDecorationStyle', 'solid'],
				['textDecorationColor', 'currentcolor'],
				['textDecorationThickness', 'auto']
			]);
			for (const token of splitValue(value, ' ')) {
				if (DECORATION_LINES.test(token)) lines.push(token);
				else if (/^(solid|double|dotted|dashed|wavy)$/.test(token)) found.set('textDecorationStyle', token);
				else if (isLength(token) || token === 'from-font') found.set('textDecorationThickness', token);
				else found.set('textDecorationColor', token);
			}
			return [['textDecorationLine', lines.filter((line) => line !== 'none').join(' ') || 'none'], ...found];
		}
	},
	listStyle: {
		longhands: ['listStyleType', 'listStylePosition'],
		expand: (value) => {
			let type = 'disc';
			let position = 'outside';
			for (const token of splitValue(value, ' ')) {
				if (token === 'inside' || token === 'outside') position = token;
				else type = token;
			}
			return [
				['listStyleType', type],
				['listStylePosition', position]
			];
		}
	},
	whiteSpace: {
		longhands: ['whiteSpaceCollapse', 'textWrapMode'],
		expand: (value) => {
			const [collapse, wrap] = WHITE_SPACE[value] ?? WHITE_SPACE.normal;
			return [
				['whiteSpaceCollapse', collapse],
				['textWrapMode', wrap]
			];
		}
	}
} satisfies Partial<Record<StyleProperty, Shorthand>>;

const WHITE_SPACE: Record<string, [string, string]> = {
	normal: ['collapse', 'wrap'],
	nowrap: ['collapse', 'nowrap'],
	pre: ['preserve', 'nowrap'],
	'pre-wrap': ['preserve', 'wrap'],
	'pre-line': ['preserve-breaks', 'wrap'],
	'break-spaces': ['break-spaces', 'wrap']
};

/** none, auto, or grow [shrink] [basis] in CSS's one-value and two-value forms */
function flexParts(value: string): [string, string, string] {
	if (value === 'none') return ['0', '0', 'auto'];
	if (value === 'auto') return ['1', '1', 'auto'];
	const numbers: string[] = [];
	let basis = '0%';
	for (const token of splitValue(value, ' ')) {
		if (/^-?[\d.]+$/.test(token) && numbers.length < 2) numbers.push(token);
		else basis = token;
	}
	return [numbers[0] ?? '1', numbers[1] ?? '1', basis];
}

const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

export function isCssWide(value: string): boolean {
	return CSS_WIDE.has(value);
}

export function expandShorthand(name: keyof typeof SHORTHANDS, value: string): LonghandValues {
	const shorthand: Shorthand = SHORTHANDS[name];
	return isCssWide(value) ? shorthand.longhands.map((longhand) => [longhand, value] as const) : shorthand.expand(value);
}
