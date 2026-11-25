// CSS value syntax parsed into style types: lengths, calc(), shadows, transforms, animations
import type {
	AnimationRef,
	Length,
	LengthOr,
	Rgba,
	Shadow,
	TransformStyle,
	TransitionRef,
	VerticalAlign
} from '../../contracts/styleTypes';
import { parseColor } from './colorValue';

export const ZERO_LENGTH: Length = { px: 0, percent: 0 };

/** splits at spaces or commas outside parentheses and quotes */
export function splitValue(value: string, separator: ' ' | ','): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote = '';
	let current = '';
	for (const c of value) {
		if (quote) quote = c === quote ? '' : quote;
		else if (c === '"' || c === "'") quote = c;
		else if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (depth === 0 && (separator === ',' ? c === ',' : /\s/.test(c))) {
			if (current.trim()) parts.push(current.trim());
			current = '';
			continue;
		}
		current += c;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

/** px and % as a linear sum; calc() of them reduces, anything else is null */
export function parseLength(value: string): Length | null {
	if (value === '0px') return ZERO_LENGTH;
	if (value.endsWith('px') && !value.includes('(')) {
		const n = Number(value.slice(0, -2));
		if (value.length > 2 && Number.isFinite(n)) return { px: n, percent: 0 };
	}
	const text = value.trim();
	const unit = /^(-?[\d.]+(?:e[-+]?\d+)?)(px|%)?$/i.exec(text);
	if (unit) {
		const n = parseFloat(unit[1]);
		if (unit[2] === '%') return { px: 0, percent: n };
		return unit[2] || n === 0 ? { px: n, percent: 0 } : null;
	}
	if (/^calc\(/i.test(text) && text.endsWith(')')) return linearSum(text.slice(5, -1));
	return null;
}

type CalcTerm = { px: number; percent: number; scalar: number | null };

/** a calc() body of px, % and plain numbers with + - * / and parentheses, reduced to px plus % */
function linearSum(body: string): Length | null {
	const tokens = body.match(/-?[\d.]+(?:e[-+]?\d+)?(?:px|%)?|[-+*/()]/gi) ?? [];
	let at = 0;
	function primary(): CalcTerm | null {
		const token = tokens[at++];
		if (token === '(') {
			const inner = sum();
			at++;
			return inner;
		}
		if (token === '-') {
			const inner = primary();
			return inner && scaled(inner, -1);
		}
		if (token === undefined || !/[\d.]/.test(token)) return null;
		const n = parseFloat(token);
		if (token.endsWith('%')) return { px: 0, percent: n, scalar: null };
		return token.endsWith('px') ? { px: n, percent: 0, scalar: null } : { px: 0, percent: 0, scalar: n };
	}
	function product(): CalcTerm | null {
		let left = primary();
		while (left && (tokens[at] === '*' || tokens[at] === '/')) {
			const divide = tokens[at++] === '/';
			const right = primary();
			if (!right) return null;
			if (divide) left = right.scalar === null ? null : scaled(left, 1 / right.scalar);
			else if (left.scalar !== null) left = scaled(right, left.scalar);
			else left = right.scalar === null ? null : scaled(left, right.scalar);
		}
		return left;
	}
	function sum(): CalcTerm | null {
		let left = product();
		while (left && (tokens[at] === '+' || tokens[at] === '-')) {
			const sign = tokens[at++] === '-' ? -1 : 1;
			const right = product();
			if (!right || (left.scalar === null) !== (right.scalar === null)) return null;
			left = {
				px: left.px + sign * right.px,
				percent: left.percent + sign * right.percent,
				scalar: left.scalar === null ? null : left.scalar + sign * right.scalar!
			};
		}
		return left;
	}
	const result = sum();
	return result && result.scalar === null && at === tokens.length ? { px: result.px, percent: result.percent } : null;
}

function scaled(term: CalcTerm, by: number): CalcTerm {
	return { px: term.px * by, percent: term.percent * by, scalar: term.scalar === null ? null : term.scalar * by };
}

export function lengthOr<K extends string>(value: string, keywords: readonly K[], fallback: K | Length = ZERO_LENGTH): LengthOr<K> {
	if (!value) return fallback;
	const keyword = keywords.find((k) => k === value);
	if (keyword) return keyword;
	return parseLength(value) ?? fallback;
}

export function px(value: string, fallback = 0): number {
	const n = parseFloat(value);
	return Number.isFinite(n) ? n : fallback;
}

export function seconds(value: string): number {
	const n = parseFloat(value);
	if (!Number.isFinite(n)) return 0;
	return value.trim().endsWith('ms') ? n : n * 1000;
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
	return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** the first radius of a corner ('4px', '4px 6px'); a percentage of half the box or more rounds it fully */
export function radius(value: string): number {
	if (value === '0px') return 0;
	const first = splitValue(value, ' ')[0] ?? '0px';
	if (first.endsWith('%')) return parseFloat(first) >= 50 ? 1e7 : 0;
	return parseLength(first)?.px ?? px(first);
}

const VERTICAL_KEYWORDS = ['baseline', 'sub', 'super', 'middle', 'top', 'bottom', 'text-top', 'text-bottom'] as const;

export function verticalAlign(value: string): VerticalAlign {
	const keyword = VERTICAL_KEYWORDS.find((k) => k === value);
	return keyword ?? parseLength(value) ?? 'baseline';
}

/** box-shadow: 'none' or a comma list of [inset] color x y blur spread in either order */
export function shadows(value: string, current: Rgba): Shadow[] {
	return !value || value === 'none' ? [] : shadowList(value, current);
}

function shadowList(value: string, current: Rgba): Shadow[] {
	return splitValue(value, ',').flatMap((one) => {
		const tokens = splitValue(one, ' ');
		const lengths: number[] = [];
		let color: Rgba | null = null;
		let inset = false;
		for (const token of tokens) {
			if (token === 'inset') inset = true;
			else if (/^-?[\d.]/.test(token)) lengths.push(px(token));
			else color = parseColor(token, current);
		}
		if (lengths.length < 2) return [];
		const [x, y, blur = 0, spread = 0] = lengths;
		return [{ x, y, blur, spread, color: color ?? current, inset }];
	});
}

function transformFunctions(value: string): { name: string; args: string[] }[] {
	const found: { name: string; args: string[] }[] = [];
	const pattern = /([a-z0-9]+)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi;
	for (let match = pattern.exec(value); match; match = pattern.exec(value))
		found.push({ name: match[1].toLowerCase(), args: splitValue(match[2], ',').flatMap((a) => splitValue(a, ' ')) });
	return found;
}

function angle(value: string): number {
	const n = parseFloat(value);
	if (value.endsWith('rad')) return (n * 180) / Math.PI;
	if (value.endsWith('turn')) return n * 360;
	return Number.isFinite(n) ? n : 0;
}

// the parsers behind an initial value run only for a value that needs them: a cold engine compiles a function on its first call
function isNone(value: string): boolean {
	return !value || value === 'none';
}

/** transform, translate, rotate, scale and transform-origin combined; null when none of them moves the box */
export function transformStyle(transform: string, translate: string, rotate: string, scale: string, origin: string): TransformStyle | null {
	return isNone(transform) && isNone(translate) && isNone(rotate) && isNone(scale)
		? null
		: movedStyle(transform, translate, rotate, scale, origin);
}

function movedStyle(transform: string, translate: string, rotate: string, scale: string, origin: string): TransformStyle | null {
	const style: TransformStyle = {
		translate: { x: ZERO_LENGTH, y: ZERO_LENGTH },
		rotate: 0,
		scale: { x: 1, y: 1 },
		origin: { x: { px: 0, percent: 50 }, y: { px: 0, percent: 50 } }
	};
	let moved = false;
	function shift(x: string | undefined, y: string | undefined): void {
		const dx = parseLength(x ?? '0px') ?? ZERO_LENGTH;
		const dy = parseLength(y ?? '0px') ?? ZERO_LENGTH;
		style.translate = { x: add(style.translate.x, dx), y: add(style.translate.y, dy) };
		moved = true;
	}
	if (translate && translate !== 'none') shift(...(splitValue(translate, ' ') as [string, string]));
	if (rotate && rotate !== 'none') {
		style.rotate += angle(splitValue(rotate, ' ').at(-1)!);
		moved = true;
	}
	if (scale && scale !== 'none') {
		const [x, y = x] = splitValue(scale, ' ').map(parseFloat);
		style.scale = { x, y };
		moved = true;
	}
	for (const { name, args } of transform && transform !== 'none' ? transformFunctions(transform) : []) {
		if (name === 'translate' || name === 'translate3d') shift(args[0], args[1]);
		else if (name === 'translatex') shift(args[0], undefined);
		else if (name === 'translatey') shift(undefined, args[0]);
		else if (name === 'rotate' || name === 'rotatez') {
			style.rotate += angle(args[0]);
			moved = true;
		} else if (name === 'scale') {
			style.scale = { x: parseFloat(args[0]), y: parseFloat(args[1] ?? args[0]) };
			moved = true;
		} else if (name === 'matrix') {
			const [a, b, , , e, f] = args.map(parseFloat);
			style.rotate += (Math.atan2(b, a) * 180) / Math.PI;
			style.scale = { x: Math.hypot(a, b), y: Math.hypot(a, b) };
			if (e || f) shift(`${e}px`, `${f}px`);
			moved = moved || a !== 1 || b !== 0;
		}
	}
	const [ox, oy] = splitValue(origin, ' ');
	style.origin = { x: parseLength(ox ?? '50%') ?? style.origin.x, y: parseLength(oy ?? '50%') ?? style.origin.y };
	return moved ? style : null;
}

function add(one: Length, two: Length): Length {
	return { px: one.px + two.px, percent: one.percent + two.percent };
}

/** the n-th entry of a comma list, repeating the list as CSS does for animation and transition longhands */
function nth(list: string[], i: number): string {
	return list[i % Math.max(1, list.length)] ?? '';
}

export function animationRef(read: (property: string) => string): AnimationRef | null {
	const name = read('animation-name');
	return !name || name === 'none' ? null : animationOf(read);
}

function animationOf(read: (property: string) => string): AnimationRef | null {
	const names = splitValue(read('animation-name'), ',');
	if (!names.length || names[0] === 'none') return null;
	const iterations = nth(splitValue(read('animation-iteration-count'), ','), 0);
	return {
		name: names[0],
		durationMs: seconds(nth(splitValue(read('animation-duration'), ','), 0)),
		delayMs: seconds(nth(splitValue(read('animation-delay'), ','), 0)),
		timing: nth(splitValue(read('animation-timing-function'), ','), 0) || 'ease',
		iterations: iterations === 'infinite' ? Infinity : parseFloat(iterations) || 1,
		direction: oneOf(
			nth(splitValue(read('animation-direction'), ','), 0),
			['normal', 'reverse', 'alternate', 'alternate-reverse'],
			'normal'
		),
		fillMode: oneOf(nth(splitValue(read('animation-fill-mode'), ','), 0), ['none', 'forwards', 'backwards', 'both'], 'none'),
		playState: oneOf(nth(splitValue(read('animation-play-state'), ','), 0), ['running', 'paused'], 'running')
	};
}

export function transitionRefs(read: (property: string) => string): TransitionRef[] {
	return read('transition-property') ? transitionList(read) : [];
}

function transitionList(read: (property: string) => string): TransitionRef[] {
	const properties = splitValue(read('transition-property'), ',');
	const durations = splitValue(read('transition-duration'), ',');
	const delays = splitValue(read('transition-delay'), ',');
	const timings = splitValue(read('transition-timing-function'), ',');
	return properties
		.map((property, i) => ({
			property,
			durationMs: seconds(nth(durations, i)),
			delayMs: seconds(nth(delays, i)),
			timing: nth(timings, i) || 'ease'
		}))
		.filter((t) => t.property !== 'none' && t.durationMs > 0);
}

/** font-stretch's computed percentage, or a keyword as the canvas fontStretch takes it */
const STRETCH_KEYWORDS: Record<string, string> = {
	'50%': 'ultra-condensed',
	'62.5%': 'extra-condensed',
	'75%': 'condensed',
	'87.5%': 'semi-condensed',
	'100%': 'normal',
	'112.5%': 'semi-expanded',
	'125%': 'expanded',
	'150%': 'extra-expanded',
	'200%': 'ultra-expanded'
};

export function stretchKeyword(value: string): string {
	return STRETCH_KEYWORDS[value] ?? (value || 'normal');
}

/** line-height in px: Chromium resolves numbers, an unrendered element in Gecko or WebKit may keep the number */
export function lineHeightPx(value: string, fontSize: number): number | 'normal' {
	if (!value || value === 'normal') return 'normal';
	if (value.endsWith('px')) return px(value);
	if (value.endsWith('%')) return (parseFloat(value) / 100) * fontSize;
	const n = parseFloat(value);
	return Number.isFinite(n) ? n * fontSize : 'normal';
}

/** white-space from its longhands where the engine has them, so 'pre' and 'break-spaces' read the same everywhere */
export function whiteSpace(
	shorthand: string,
	collapse: string,
	wrapMode: string
): 'normal' | 'nowrap' | 'pre' | 'pre-wrap' | 'pre-line' | 'break-spaces' {
	const known = ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'] as const;
	if (collapse && wrapMode) {
		const wraps = wrapMode !== 'nowrap';
		if (collapse === 'break-spaces') return 'break-spaces';
		if (collapse === 'preserve') return wraps ? 'pre-wrap' : 'pre';
		if (collapse === 'preserve-breaks') return 'pre-line';
		return wraps ? 'normal' : 'nowrap';
	}
	return oneOf(shorthand, known, 'normal');
}
