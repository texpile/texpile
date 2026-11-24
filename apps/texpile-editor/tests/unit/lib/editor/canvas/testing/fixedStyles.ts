// the real style resolver for unit runs (jsdom): a 16px serif root, tags as block or inline with no other look, looks
// by selector the test gives, and a fixed token table
import type { ComputedStyle, FontSpec, LayoutStyle, PaintStyle, Rgba, RunChain, RunStyle, StyleBase, StyleLook } from '$lib/editor/canvas';
import type { FaceElement } from '$lib/editor/canvas';
import type { ViewStyles } from '$lib/editor/canvas/contracts/engineTypes';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import { fixedTokenText } from './fixedTokens';

export type FixedStyleRule = { readonly selector: string; readonly look: StyleLook };

const INLINE_TAGS = new Set(['a', 'span', 'em', 'strong', 'b', 'i', 'u', 's', 'code', 'sup', 'sub', 'mark', 'kbd', 'label', 'img', 'br']);
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };
const ZERO = { px: 0, percent: 0 };
const edges = <T>(value: T): { top: T; right: T; bottom: T; left: T } => ({ top: value, right: value, bottom: value, left: value });

/** the root every fixed style inherits: FIXED_FONT on 24px lines */
export const FIXED_ROOT_LOOK: StyleLook = {
	fontFamily: 'serif',
	fontSize: '16px',
	lineHeight: '24px',
	fontVariantLigatures: 'none',
	color: 'rgb(0 0 0)',
	whiteSpace: 'break-spaces'
};
const BLOCK_TAG: StyleLook = { display: 'block' };
const INLINE_TAG: StyleLook = { display: 'inline' };

/** looks by selector, merged in rule order; the merged look is kept per set of matching rules */
function fixedBase(rules: readonly FixedStyleRule[]): StyleBase {
	const merged = new Map<string, StyleLook>();
	return {
		root: () => FIXED_ROOT_LOOK,
		tag: (tag) => (INLINE_TAGS.has(tag) ? INLINE_TAG : BLOCK_TAG),
		node(el) {
			const matching = rules.flatMap((rule, i) => (el.matches(rule.selector) ? [i] : []));
			if (!matching.length) return null;
			const key = matching.join(',');
			let look = merged.get(key);
			if (!look) merged.set(key, (look = Object.assign({}, ...matching.map((i) => rules[i].look)) as StyleLook));
			return look;
		},
		selectedNode: () => null
	};
}

/** a theme a test switches: its tokens and epochs, which it changes and bumps itself */
export type FixedTheme = { tokens: Record<string, string>; epoch: number; paintEpoch: number };

export function fixedStyles(rules: readonly FixedStyleRule[] = [], theme?: FixedTheme): CanvasStyleResolver {
	return new CanvasStyleResolver({
		base: fixedBase(rules),
		tokens: theme ? (name) => fixedTokenText(theme.tokens)(name) : fixedTokenText(),
		epochs: theme,
		layoutChanged: theme && (() => theme.epoch++)
	});
}

/** the fixed styles as a view drives them: no getComputedStyle, epochs only as the theme moves them */
export function fixedViewStyles(rules: readonly FixedStyleRule[] = [], theme?: FixedTheme): ViewStyles {
	const styles = fixedStyles(rules, theme);
	return {
		get epoch() {
			return styles.epoch;
		},
		get paintEpoch() {
			return styles.paintEpoch;
		},
		styleOf: (el: FaceElement, pseudo?: 'before' | 'after' | 'marker') => styles.styleOf(el, pseudo),
		runStyle: (block: FaceElement, chain: RunChain) => styles.runStyle(block, chain),
		setState: (el, state, on) => styles.setState(el, state, on),
		token: (name) => styles.token(name),
		rootStyle: () => styles.rootStyle(),
		markSelectedNode: (el, on) => styles.markSelectedNode(el, on),
		current: (style: ComputedStyle) => styles.current(style),
		currentRun: (run: RunStyle) => styles.currentRun(run),
		onEpoch: () => () => {},
		checkEpoch() {},
		reads: 0,
		styleMs: 0,
		themeReadMs: 0,
		destroy() {}
	};
}

export const FIXED_FONT: FontSpec = {
	families: 'serif',
	sizePx: 16,
	weight: 400,
	style: 'normal',
	caps: 'normal',
	stretch: 'normal',
	numeric: 'normal',
	ligatures: false,
	kerning: 'normal'
};

export function defaultLayoutStyle(display: LayoutStyle['display'] = 'block'): LayoutStyle {
	return {
		display,
		position: 'static',
		inset: edges<'auto'>('auto'),
		float: 'none',
		clear: 'none',
		boxSizing: 'content-box',
		width: 'auto',
		minWidth: 'auto',
		maxWidth: 'none',
		height: 'auto',
		minHeight: 'auto',
		maxHeight: 'none',
		aspectRatio: null,
		margin: edges(ZERO),
		padding: edges(ZERO),
		borderWidth: edges(0),
		borderStyle: edges('none'),
		font: FIXED_FONT,
		lineHeight: 24,
		letterSpacing: 0,
		wordSpacing: 0,
		textIndent: ZERO,
		textAlign: 'start',
		textAlignLast: 'auto',
		textTransform: 'none',
		whiteSpace: 'break-spaces',
		overflowWrap: 'normal',
		wordBreak: 'normal',
		hyphens: 'manual',
		verticalAlign: 'baseline',
		direction: 'ltr',
		writingMode: 'horizontal-tb',
		flex: {
			direction: 'row',
			wrap: 'nowrap',
			grow: 0,
			shrink: 1,
			basis: 'auto',
			justifyContent: 'normal',
			alignItems: 'normal',
			alignSelf: 'auto',
			alignContent: 'normal'
		},
		grid: {
			templateColumns: 'none',
			templateRows: 'none',
			autoColumns: 'auto',
			autoRows: 'auto',
			autoFlow: 'row',
			column: { start: 'auto', end: 'auto' },
			row: { start: 'auto', end: 'auto' },
			justifyItems: 'normal',
			justifySelf: 'auto'
		},
		gap: { row: ZERO, column: ZERO },
		columns: { count: null, gap: ZERO, fill: 'balance' },
		table: {
			layout: 'auto',
			borderCollapse: 'separate',
			borderSpacing: { horizontal: 0, vertical: 0 },
			captionSide: 'top',
			emptyCells: 'show'
		},
		overflowX: 'visible',
		overflowY: 'visible',
		textOverflow: 'clip',
		lineClamp: null,
		listStyle: { type: 'disc', position: 'outside' },
		transform: null,
		order: 0,
		visibility: 'visible',
		zIndex: 'auto'
	};
}

export function defaultPaintStyle(): PaintStyle {
	return {
		color: BLACK,
		backgroundColor: CLEAR,
		borderColor: edges(BLACK),
		borderRadius: { tl: 0, tr: 0, br: 0, bl: 0 },
		outline: null,
		boxShadow: [],
		opacity: 1,
		textDecoration: { lines: [], style: 'solid', color: BLACK, thickness: 'auto', underlineOffset: 'auto' },
		cursor: 'auto',
		pointerEvents: 'auto',
		userSelect: 'auto',
		animation: null,
		transition: [],
		caretColor: 'auto',
		accentColor: 'auto'
	};
}

export function fontStringOf(font: FontSpec): string {
	return `${font.style === 'normal' ? '' : `${font.style} `}${font.weight === 400 ? '' : `${font.weight} `}${font.sizePx}px ${font.families}`;
}
