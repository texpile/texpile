// declared values as views, toDOM, decorations and the base write them, computed against the parent's style
import type { Rgba, StyleLook, ThemeToken, ThemeTokenText } from '../../contracts/styleTypes';
import { declarationsOf } from '../../tree/faceStyle';
import { parseColor } from './colorValue';
import { resolveLightDark } from '../theme/tokenText';
import { parseLength } from './cssValues';
import { expandShorthand } from './shorthands';
import { isShorthand, LONGHAND_INDEX, SHORTHAND_BY_CSS, type LonghandSpec } from './styleProperties';

/** a longhand index and its value, tokens substituted, in declaration order */
export type Declaration = readonly [number, string];

export type ComputeContext = {
	readonly parentFontPx: number;
	fontPx: number;
	readonly remPx: number;
	readonly parentColor: Rgba;
	readonly parentWeight: number;
	readonly viewport: { readonly width: number; readonly height: number };
};

export function reportInvalid(message: string): void {
	if (import.meta.env?.DEV) throw new Error(`canvas style: ${message}`);
}

const dropped = new Set<string>();

/** a declaration the DOM drops too (a document's \color[rgb]{.2,.4,.6} through a mark's toDOM): dropped, said once in dev */
export function reportDropped(message: string): void {
	if (!import.meta.env?.DEV || dropped.has(message)) return;
	dropped.add(message);
	console.debug(`canvas style: ${message} is dropped`);
}

function closingParen(text: string, open: number): number {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		if (text[i] === '(') depth++;
		else if (text[i] === ')' && --depth === 0) return i;
	}
	return -1;
}

/** a declaration naming a token the theme leaves unset, with no fallback: invalid at computed-value time, so unset */
export const UNSET_TOKEN = '\u0000unset';

/** var(--token, fallback) replaced by the token's text, recursively; null when a name is off the token list */
export function substituteTokens(text: string, tokenValue: ThemeTokenText, depth = 0): string | null {
	const at = text.indexOf('var(');
	if (at < 0) return text;
	if (depth > 16) return null;
	const end = closingParen(text, at + 3);
	if (end < 0) return null;
	const body = text.slice(at + 4, end);
	const comma = body.indexOf(',');
	const name = (comma < 0 ? body : body.slice(0, comma)).trim() as ThemeToken;
	const declared = tokenValue(name);
	const value = declared || (comma < 0 ? declared : body.slice(comma + 1).trim());
	if (value === null) {
		reportInvalid(`${name} is not a theme token`);
		return null;
	}
	if (!value) return UNSET_TOKEN;
	const inner = substituteTokens(value, tokenValue, depth + 1);
	if (inner === null || inner === UNSET_TOKEN) return inner;
	return substituteTokens(text.slice(0, at) + inner + text.slice(end + 1), tokenValue, depth + 1);
}

const UNIT = /(?<![\w#.])(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(rem|em|ex|ch|pt|pc|in|cm|mm|q|vw|vh|vmin|vmax)(?![\w%])/gi;

const ABSOLUTE_UNITS: Record<string, number> = { pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };

function unitPx(unit: string, emPx: number, ctx: Pick<ComputeContext, 'remPx' | 'viewport'>): number {
	const { width, height } = ctx.viewport;
	if (unit === 'em') return emPx;
	if (unit === 'rem') return ctx.remPx;
	if (unit === 'ex' || unit === 'ch') return emPx / 2;
	if (unit === 'vw') return width / 100;
	if (unit === 'vh') return height / 100;
	if (unit === 'vmin') return Math.min(width, height) / 100;
	if (unit === 'vmax') return Math.max(width, height) / 100;
	return ABSOLUTE_UNITS[unit];
}

/** em, rem and absolute units as px; % stays for layout to resolve */
export function absolutize(text: string, emPx: number, ctx: Pick<ComputeContext, 'remPx' | 'viewport'>): string {
	if (!/\d[a-z]/i.test(text)) return text;
	return text.replace(UNIT, (_, number: string, unit: string) => `${parseFloat(number) * unitPx(unit.toLowerCase(), emPx, ctx)}px`);
}

function pxOf(text: string, percentOf: number): number | null {
	const length = parseLength(text);
	return length && length.px + (length.percent / 100) * percentOf;
}

const FONT_SIZES: Record<string, number> = {
	'xx-small': 9,
	'x-small': 10,
	small: 13,
	medium: 16,
	large: 18,
	'x-large': 24,
	'xx-large': 32,
	'xxx-large': 48
};
const LINE_WIDTHS: Record<string, string> = { thin: '1px', medium: '3px', thick: '5px' };

function fontSizeOf(text: string, ctx: ComputeContext): string | null {
	if (text in FONT_SIZES) return `${FONT_SIZES[text]}px`;
	if (text === 'smaller') return `${ctx.parentFontPx / 1.2}px`;
	if (text === 'larger') return `${ctx.parentFontPx * 1.2}px`;
	const size = pxOf(absolutize(text, ctx.parentFontPx, ctx), ctx.parentFontPx);
	return size === null ? null : `${size}px`;
}

/** a unitless line height stays a factor, so children inherit it against their own font size */
function lineHeightOf(text: string, ctx: ComputeContext): string | null {
	if (text === 'normal') return text;
	if (/^-?[\d.]+(e[-+]?\d+)?$/i.test(text)) return String(parseFloat(text));
	const height = pxOf(absolutize(text, ctx.fontPx, ctx), ctx.fontPx);
	return height === null ? null : `${height}px`;
}

function fontWeightOf(text: string, parent: number): string | null {
	if (text === 'normal') return '400';
	if (text === 'bold') return '700';
	if (text === 'bolder') return String(parent < 350 ? 400 : parent < 550 ? 700 : 900);
	if (text === 'lighter') return String(parent < 550 ? 100 : parent < 750 ? 400 : 700);
	return /^\d+(\.\d+)?$/.test(text) ? text : null;
}

function pxValueOf(text: string, ctx: ComputeContext): string | null {
	if (text === 'normal') return '0px';
	const absolute = absolutize(text, ctx.fontPx, ctx);
	if (!absolute.startsWith('calc(')) return absolute;
	const px = pxOf(absolute, 0);
	return px === null ? null : `${px}px`;
}

/** rgb() with unrounded channels, so a mix of a mix keeps its precision */
export function colorText(color: Rgba): string {
	return `rgb(${color.r * 255} ${color.g * 255} ${color.b * 255} / ${color.a})`;
}

/** the computed value of one declared longhand; null: invalid, which computes as unset */
export function computeValue(spec: LonghandSpec, text: string, ctx: ComputeContext): string | null {
	switch (spec.kind) {
		case 'string':
			return text;
		case 'fontSize':
			return fontSizeOf(text, ctx);
		case 'lineHeight':
			return lineHeightOf(text, ctx);
		case 'fontWeight':
			return fontWeightOf(text, ctx.parentWeight);
		case 'px':
			return pxValueOf(text, ctx);
		case 'lineWidth':
			return LINE_WIDTHS[text] ?? pxValueOf(text, ctx);
		case 'color': {
			const color = parseColor(text, ctx.parentColor);
			return color && colorText(color);
		}
		case 'paintColor':
			// currentColor in it is the element's own color: paint parses it against that
			return parseColor(text) ? text.toLowerCase() : null;
		default:
			return absolutize(text, ctx.fontPx, ctx);
	}
}

function longhandsOf(property: string, value: string, tokenValue: ThemeTokenText, dark: boolean): Declaration[] {
	// a DOM producer's own custom property (--range-tint) declares nothing the canvas draws
	if (property.startsWith('--')) return [];
	const found = substituteTokens(value.trim(), tokenValue);
	if (found === null) return [];
	const substituted = found === UNSET_TOKEN ? 'unset' : found.includes('light-dark(') ? resolveLightDark(found, dark) : found;
	const shorthand = isShorthand(property) ? property : SHORTHAND_BY_CSS.get(property);
	if (shorthand) {
		return expandShorthand(shorthand, substituted).map(([longhand, text]) => [LONGHAND_INDEX.get(longhand)!, text.trim()] as const);
	}
	const index = LONGHAND_INDEX.get(property);
	if (index === undefined) {
		reportDropped(`${property}, outside the canvas property set,`);
		return [];
	}
	return [[index, substituted]];
}

/** parsed declarations by property and value text, until the tokens change */
export class DeclaredValues {
	private readonly parsed = new Map<string, readonly Declaration[]>();
	private looks = new WeakMap<StyleLook, readonly Declaration[]>();

	constructor(
		private readonly tokenValue: ThemeTokenText,
		/** the scheme a look's light-dark() takes its side from */
		private readonly dark: () => boolean = () => false
	) {}

	clear(): void {
		this.parsed.clear();
		this.looks = new WeakMap();
	}

	declaration(property: string, value: string): readonly Declaration[] {
		const key = `${property}\u0000${value}`;
		let found = this.parsed.get(key);
		if (!found) this.parsed.set(key, (found = longhandsOf(property, value, this.tokenValue, this.dark())));
		return found;
	}

	inline(cssText: string): readonly Declaration[] {
		let found = this.parsed.get(cssText);
		if (!found) {
			found = declarationsOf(cssText).flatMap(([property, value]) => this.declaration(property, value));
			this.parsed.set(cssText, found);
		}
		return found;
	}

	look(look: StyleLook): readonly Declaration[] {
		let found = this.looks.get(look);
		if (!found) {
			found = Object.entries(look).flatMap(([property, value]) => (value ? this.declaration(property, value) : []));
			this.looks.set(look, found);
		}
		return found;
	}
}
