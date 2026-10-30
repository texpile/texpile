import type { ShapeStyle, StyleTarget } from '$lib/draw/editor/figure/figureLanguage';
import { readTextColor, readTextSize } from './textOptions';

// what the inspector shows and sets, read from and written to a command's own option items

export const COLOR_NAMES = [
	'black',
	'gray',
	'red',
	'orange',
	'green',
	'teal',
	'blue',
	'violet',
	'brown',
	'white',
	'cyan',
	'magenta',
	'yellow',
	'purple',
	'lime',
	'olive',
	'pink',
	'darkgray',
	'lightgray'
];

export const WIDTHS = ['thin', 'semithick', 'thick', 'very thick'] as const;
export const ALL_WIDTHS = ['ultra thin', 'very thin', 'thin', 'semithick', 'thick', 'very thick', 'ultra thick'];
export const DASHES = ['solid', 'dashed', 'dotted'] as const;
export const ALL_DASHES = [
	'solid',
	'dashed',
	'dotted',
	'densely dashed',
	'loosely dashed',
	'densely dotted',
	'loosely dotted',
	'dash dot',
	'dash dot dot',
	'densely dash dot',
	'loosely dash dot'
];
export const ARROWS = ['', '->', '<-', '<->'] as const;
export const OPACITIES = ['100', '75', '50', '25'] as const;

// a tip on either side of the one dash: `>`, `|`, arrows.meta's capitalized names, or the old lowercase ones
const TIP =
	/^(?:[<>|]*|[A-Z][A-Za-z ]*|(?:open )?(?:stealth|latex|to|triangle 45|triangle 60|triangle 90|angle 45|angle 60|angle 90|hooks)'?)$/;

export function isColor(item: string) {
	const m = item.match(/^([a-z]+)(![0-9.]+(![a-z]+)?)*$/i);
	return !!m && COLOR_NAMES.includes(m[1]);
}

function keyValue(item: string): [string, string | null] {
	const at = item.indexOf('=');
	return at < 0 ? [item.trim(), null] : [item.slice(0, at).trim(), item.slice(at + 1).trim()];
}

export function isArrowSpec(item: string) {
	const sides = item.replace(/\{[^}]*\}/g, '').split('-');
	return sides.length === 2 && !sides.some((s) => s.includes('=')) && sides.every((s) => TIP.test(s.trim()));
}

export function targetOf(command: string): StyleTarget | null {
	switch (command) {
		case '\\draw':
			return 'draw';
		case '\\fill':
			return 'fill';
		case '\\filldraw':
			return 'filldraw';
		case '\\path':
			return 'path';
		case '\\node':
			return 'node';
		default:
			return null;
	}
}

/** which items name the stroke color, and whether a bare color counts as it; `color=` on a fill or a node is its fill or text */
function strokeKeys(target: StyleTarget) {
	return { keys: target === 'fill' || target === 'node' ? ['draw'] : ['draw', 'color'], bare: target === 'draw' || target === 'filldraw' };
}

/** a \filldraw's bare color fills it too, but a fill set from the inspector is its own `fill=` */
function fillKeys(target: StyleTarget, reading = false) {
	return { keys: target === 'fill' ? ['fill', 'color'] : ['fill'], bare: target === 'fill' || (reading && target === 'filldraw') };
}

function readColor(items: string[], { keys, bare }: { keys: string[]; bare: boolean }, implied: string | null) {
	let color: string | null = implied;
	for (const item of items) {
		const [k, v] = keyValue(item);
		if (bare && isColor(item)) color = item;
		else if (keys.includes(k)) color = v ?? color ?? 'black';
	}
	return color;
}

export function readStyle(items: string[], target: StyleTarget): ShapeStyle {
	const implied = target === 'draw' || target === 'filldraw' ? 'black' : null;
	let width: string | null = null;
	let dash: string | null = 'solid';
	let arrows: string | null = '';
	for (const item of items) {
		const [k] = keyValue(item);
		if (ALL_WIDTHS.includes(item)) width = item;
		else if (k === 'line width') width = 'custom';
		else if (ALL_DASHES.includes(item)) dash = DASHES.includes(item as (typeof DASHES)[number]) ? item : 'custom';
		else if (k === 'dash pattern') dash = 'custom';
		else if (isArrowSpec(item)) arrows = ARROWS.includes(item as (typeof ARROWS)[number]) ? item : 'custom';
	}
	return {
		stroke: target === 'fill' ? null : readColor(items, strokeKeys(target), implied),
		fill: readColor(items, fillKeys(target, true), target === 'fill' || target === 'filldraw' ? 'black' : null),
		width: width ?? 'thin',
		dash,
		arrows,
		textColor: target === 'node' ? readTextColor(items) : null,
		textSize: target === 'node' ? readTextSize(items) : null,
		opacity: readOpacity(items),
		corners: target === 'node' ? null : items.some((i) => keyValue(i)[0] === 'rounded corners') ? 'rounded' : 'sharp'
	};
}

function readOpacity(items: string[]) {
	const v = items
		.map((i) => keyValue(i))
		.filter(([k]) => k === 'opacity')
		.at(-1)?.[1];
	if (!v) return '100';
	const percent = String(Math.round(Number(v) * 100));
	return OPACITIES.includes(percent as (typeof OPACITIES)[number]) ? percent : 'custom';
}

export function withOpacity(items: string[], percent: string) {
	return replaceItems(items, (item) => keyValue(item)[0] === 'opacity', percent === '100' ? null : `opacity=${Number(percent) / 100}`);
}

export function withCorners(items: string[], corners: 'sharp' | 'rounded') {
	return replaceItems(items, (item) => keyValue(item)[0] === 'rounded corners', corners === 'rounded' ? 'rounded corners' : null);
}

/** drops what `drop` matches and puts `add` where the first dropped item was, else at the end */
function replaceItems(items: string[], drop: (item: string) => boolean, add: string | null) {
	const at = items.findIndex(drop);
	const kept = items.filter((item) => !drop(item));
	if (add === null) return kept;
	kept.splice(at < 0 ? kept.length : at, 0, add);
	return kept;
}

function colorDropper({ keys, bare }: { keys: string[]; bare: boolean }) {
	return (item: string) => (bare && isColor(item)) || keys.includes(keyValue(item)[0]);
}

export function withStroke(items: string[], target: StyleTarget, color: string | null) {
	const spec = strokeKeys(target);
	const add = color === null ? null : spec.bare ? color : color === 'black' && target === 'node' ? 'draw' : `draw=${color}`;
	return replaceItems(items, colorDropper(spec), add);
}

export function withFill(items: string[], target: StyleTarget, color: string | null) {
	const spec = fillKeys(target);
	// a \filldraw fills unless told not to
	const none = target === 'filldraw' ? 'fill=none' : null;
	return replaceItems(items, colorDropper(spec), color === null ? none : spec.bare ? color : `fill=${color}`);
}

export function withWidth(items: string[], width: string) {
	return replaceItems(items, (item) => ALL_WIDTHS.includes(item) || keyValue(item)[0] === 'line width', width === 'thin' ? null : width);
}

export function withDash(items: string[], dash: string) {
	return replaceItems(items, (item) => ALL_DASHES.includes(item) || keyValue(item)[0] === 'dash pattern', dash === 'solid' ? null : dash);
}

export function withArrows(items: string[], arrows: string) {
	return replaceItems(items, isArrowSpec, arrows || null);
}
