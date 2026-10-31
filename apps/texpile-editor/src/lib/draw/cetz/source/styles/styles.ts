import type { ShapeStyle } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { readTextStyle, writeTextStyle } from '../nodes/nodeText';
import { namedArg, type CetzStatement } from '../picture';
import { splitArgs } from '../syntax';

export const WIDTHS = ['0.5pt', '1pt', '2pt', '3pt'] as const;
export const DASHES = ['solid', 'dashed', 'dotted'] as const;
export const ARROWS = ['', '->', '<-', '<->'] as const;
export const OPACITIES = ['100', '75', '50', '25'] as const;

const LENGTH = /^-?\d+(?:\.\d+)?(?:pt|mm|cm|em)$/;

type StrokeParts = { paint: string | null | undefined; thickness?: string; dash?: string; rest: string[] };

/** a stroke as Typst writes it: `none`, a color, a length, `color + length`, or a dictionary */
function readStroke(text: string | null): StrokeParts {
	if (text === null) return { paint: undefined, rest: [] };
	if (text === 'none') return { paint: null, rest: [] };
	if (text.startsWith('(')) {
		const parts: StrokeParts = { paint: undefined, rest: [] };
		for (const a of splitArgs(text, 0, text.length - 1)) {
			const value = text.slice(a.value.from, a.value.to);
			if (a.name === 'paint') parts.paint = value;
			else if (a.name === 'thickness') parts.thickness = value;
			else if (a.name === 'dash') parts.dash = value.replace(/^"|"$/g, '');
			else parts.rest.push(text.slice(a.from, a.to));
		}
		return parts;
	}
	const parts: StrokeParts = { paint: undefined, rest: [] };
	for (const term of text.split('+').map((t) => t.trim())) {
		if (LENGTH.test(term)) parts.thickness = term;
		else parts.paint = term;
	}
	return parts;
}

function writeStroke(p: StrokeParts): string | null {
	if (p.paint === null) return 'none';
	if (p.dash || p.rest.length) {
		const items = [
			p.paint !== undefined ? `paint: ${p.paint}` : null,
			p.thickness ? `thickness: ${p.thickness}` : null,
			p.dash ? `dash: "${p.dash}"` : null,
			...p.rest
		].filter(Boolean);
		return `(${items.join(', ')})`;
	}
	if (p.paint !== undefined && p.thickness) return `${p.paint} + ${p.thickness}`;
	return p.paint ?? p.thickness ?? null;
}

function readArrows(text: string | null) {
	if (!text?.startsWith('(')) return '';
	const keys = new Set(splitArgs(text, 0, text.length - 1).map((a) => a.name));
	const start = keys.has('start') || keys.has('symbol');
	const end = keys.has('end') || keys.has('symbol');
	return start && end ? '<->' : start ? '<-' : end ? '->' : '';
}

/** text alone, which draws a border and a background only in a frame */
function unframed(source: string, st: CetzStatement) {
	return st.command === 'content' && !st.text && !namedArg(source, st, 'frame');
}

const ALPHA = /^(.*)\.transparentize\((\d+(?:\.\d+)?)%\)$/;

/** a paint and how far it shows through, TikZ's opacity: `red.transparentize(50%)` is red at 50 */
function splitAlpha(paint: string | null | undefined) {
	const m = paint ? ALPHA.exec(paint) : null;
	return m ? { base: m[1], opacity: 100 - Number(m[2]) } : { base: paint, opacity: 100 };
}

function withAlpha(base: string, opacity: number) {
	return opacity >= 100 ? base : `${base}.transparentize(${formatNumber(100 - opacity)}%)`;
}

export function readStyle(source: string, st: CetzStatement): ShapeStyle {
	const stroke = readStroke(namedArg(source, st, 'stroke')?.text ?? null);
	const fill = splitAlpha(namedArg(source, st, 'fill')?.text ?? null);
	const bare = unframed(source, st);
	const text = st.kind === 'node' ? readTextStyle(source, st) : null;
	const paint = splitAlpha(stroke.paint);
	const textPaint = splitAlpha(text?.textColor);
	// a shape is as opaque as the first of its paints set
	const shown = [fill.base && fill.base !== 'none' ? fill : null, stroke.paint ? paint : null, textPaint].find((p) => p?.base);
	const opacity = String(shown?.opacity ?? 100);
	return {
		stroke: bare || stroke.paint === null ? null : (paint.base ?? 'black'),
		fill: bare || fill.base === 'none' ? null : (fill.base ?? null),
		width: stroke.thickness ?? '1pt',
		dash: stroke.dash ?? 'solid',
		arrows: st.kind === 'node' ? '' : readArrows(namedArg(source, st, 'mark')?.text ?? null),
		textColor: textPaint.base ?? null,
		textSize: text?.textSize ?? null,
		opacity: OPACITIES.includes(opacity as (typeof OPACITIES)[number]) ? opacity : 'custom',
		corners: st.kind !== 'node' && st.command === 'rect' ? (namedArg(source, st, 'radius') ? 'rounded' : 'sharp') : null
	};
}

/** a named argument set to `value`, added before the closing parenthesis, or removed when `value` is null */
export function setNamedArg(source: string, st: CetzStatement, name: string, value: string | null) {
	const at = st.args.findIndex((a) => a.name === name);
	if (at >= 0) {
		const a = st.args[at];
		if (value !== null) return source.slice(0, a.value.from) + value + source.slice(a.value.to);
		// takes its comma with it: the one before, or the one after when it is first
		const from = at > 0 ? st.args[at - 1].to : a.from;
		const to = at > 0 ? a.to : (st.args[at + 1]?.from ?? a.to);
		return source.slice(0, from) + source.slice(to);
	}
	if (value === null) return source;
	const last = st.args.at(-1);
	return last
		? `${source.slice(0, last.to)}, ${name}: ${value}${source.slice(last.to)}`
		: `${source.slice(0, st.close)}${name}: ${value}${source.slice(st.close)}`;
}

export function writeStyle(source: string, st: CetzStatement, change: Partial<ShapeStyle>, reread: (text: string) => CetzStatement | null) {
	let text = source;
	let current: CetzStatement | null = st;
	function set(name: string, value: string | null) {
		if (!current) return;
		text = setNamedArg(text, current, name, value);
		current = reread(text);
	}
	const before = readStyle(source, st);
	// each paint set again at the opacity it is to have, the one picked or the one it had
	const opacity = Number(
		change.opacity && change.opacity !== 'custom' ? change.opacity : before.opacity === 'custom' ? 100 : before.opacity
	);
	const bare = unframed(source, st);
	// text alone takes a border or a background in a frame, and loses the frame with the last of them
	if (bare && (change.stroke || change.fill)) {
		set('frame', '"rect"');
		set('padding', '0.1');
		if (!change.stroke) set('stroke', 'none');
	}
	if (current && !unframed(text, current) && ('stroke' in change || change.width || change.dash || change.opacity)) {
		const parts = readStroke(namedArg(text, current, 'stroke')?.text ?? null);
		if ('stroke' in change) parts.paint = change.stroke === null ? null : (change.stroke ?? undefined);
		else if (parts.paint !== null) parts.paint = splitAlpha(parts.paint).base;
		if (change.width) parts.thickness = change.width === '1pt' ? undefined : change.width;
		if (change.dash) parts.dash = change.dash === 'solid' ? undefined : change.dash;
		if (parts.paint !== null && opacity < 100) parts.paint = withAlpha(parts.paint ?? 'black', opacity);
		if (parts.paint === 'black' && !parts.thickness && !parts.dash && !parts.rest.length) parts.paint = undefined;
		set('stroke', writeStroke(parts));
		// CeTZ draws a mark in its line's paint, so a line taken away takes its arrowheads
		if (parts.paint === null) set('mark', null);
	}
	if (current && !unframed(text, current) && ('fill' in change || change.opacity)) {
		const fill = 'fill' in change ? (change.fill ?? null) : before.fill;
		set('fill', fill && withAlpha(fill, opacity));
	}
	if (st.kind === 'node' && !st.text && current && !unframed(text, current)) {
		const now = readStyle(text, current);
		if (!now.stroke && !now.fill) for (const name of ['frame', 'stroke', 'fill', 'padding']) set(name, null);
	}
	if (st.kind === 'node' && current && ('textColor' in change || change.textSize || change.opacity)) {
		const color = 'textColor' in change ? (change.textColor ?? 'black') : (before.textColor ?? 'black');
		const textColor = withAlpha(color, opacity);
		const styled = writeTextStyle(text, current, { textColor, ...(change.textSize && { textSize: change.textSize }) });
		if (styled) text = styled;
		current = reread(text);
	}
	if (change.corners && st.command === 'rect') set('radius', change.corners === 'rounded' ? '0.2' : null);
	if (change.arrows !== undefined && change.arrows !== null) {
		const a = change.arrows;
		// the arrowhead TikZ's `->` draws
		const tip = '"straight"';
		set('mark', a === '->' ? `(end: ${tip})` : a === '<-' ? `(start: ${tip})` : a === '<->' ? `(start: ${tip}, end: ${tip})` : null);
	}
	return text;
}
