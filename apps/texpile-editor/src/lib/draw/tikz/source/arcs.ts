import type { ArcSpan } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { pathPoints } from './coordinates';
import { splitItems } from './options/optionList';
import type { Statement } from './picture';
import type { TextEdit } from './sourceText';

const ARC = /\barc\s*(\[[^\]]*\]|\([^()]*\))/g;
const NUMBER = /^-?\d*\.?\d+$/;

/** where an angle lands once the arc is mirrored by a negative scale */
function mirroredAngle(degrees: number, sx: number, sy: number) {
	if (sx < 0 && sy < 0) return degrees + 180;
	if (sx < 0) return 180 - degrees;
	return sy < 0 ? -degrees : degrees;
}

/** `arc[...]` stretched: radii by the scale along their axis, a circle's into an ellipse's when the two differ, angles
 *  mirrored with it; what is not a plain number stays */
function stretchedOptions(items: string[], sx: number, sy: number) {
	const [ax, ay] = [Math.abs(sx), Math.abs(sy)];
	const flipped = sx < 0 !== sy < 0;
	return items.flatMap((item) => {
		const m = /^(radius|x radius|y radius|start angle|end angle|delta angle)\s*=\s*(.*)$/.exec(item);
		if (!m || !NUMBER.test(m[2].trim())) return [item];
		const v = Number(m[2]);
		if (m[1] === 'radius')
			return Math.abs(ax - ay) < 1e-9
				? [`radius=${formatNumber(v * ax)}`]
				: [`x radius=${formatNumber(v * ax)}`, `y radius=${formatNumber(v * ay)}`];
		if (m[1] === 'x radius') return [`x radius=${formatNumber(v * ax)}`];
		if (m[1] === 'y radius') return [`y radius=${formatNumber(v * ay)}`];
		if (m[1] === 'delta angle') return [`delta angle=${formatNumber(flipped ? -v : v)}`];
		return [`${m[1]}=${formatNumber(mirroredAngle(v, sx, sy))}`];
	});
}

/** `arc(a:b:r)` or `arc(a:b:rx and ry)` stretched the same way */
function stretchedShort(inner: string, sx: number, sy: number) {
	const parts = inner.split(':').map((s) => s.trim());
	const radii = parts[2]?.split(/\s+and\s+/) ?? [];
	if (parts.length !== 3 || !parts.slice(0, 2).every((p) => NUMBER.test(p)) || !radii.every((r) => NUMBER.test(r))) return null;
	const [a, b] = parts.slice(0, 2).map((p) => formatNumber(mirroredAngle(Number(p), sx, sy)));
	const [rx, ry] = [Number(radii[0]) * Math.abs(sx), Number(radii[1] ?? radii[0]) * Math.abs(sy)];
	const r = radii.length === 1 && Math.abs(rx - ry) < 1e-9 ? formatNumber(rx) : `${formatNumber(rx)} and ${formatNumber(ry)}`;
	return `${a}:${b}:${r}`;
}

/** the statement's arcs, each scaled as its points are, so an arc stays on the shape it is part of */
export function arcStretchEdits(source: string, st: Statement, sx: number, sy: number): TextEdit[] {
	const text = source.slice(st.from, st.to);
	return [...text.matchAll(ARC)].flatMap((m) => {
		const spec = m[1];
		const from = st.from + m.index! + m[0].length - spec.length;
		const inner = spec.slice(1, -1);
		const stretched =
			spec[0] === '[' ? `[${stretchedOptions(splitItems(inner), sx, sy).join(', ')}]` : `(${stretchedShort(inner, sx, sy) ?? inner})`;
		return stretched === spec ? [] : [{ from, to: from + spec.length, text: stretched }];
	});
}

/** the arc's angles and radius, where each is written as a plain number; `at` is where its radius is written */
function readArc(spec: string, from: number) {
	const inner = spec.slice(1, -1);
	if (spec[0] === '(') {
		const m = /^\s*(-?\d*\.?\d+)\s*:\s*(-?\d*\.?\d+)\s*:\s*(\d*\.?\d+)\s*$/.exec(inner);
		return m
			? { start: Number(m[1]), end: Number(m[2]), value: Number(m[3]), at: from + 1 + inner.lastIndexOf(m[3]), length: m[3].length }
			: null;
	}
	const r = /(?:^|,)\s*radius\s*=\s*(\d*\.?\d+)\s*(?=,|$)/.exec(inner);
	function angle(key: string) {
		const m = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*(-?\\d*\\.?\\d+)\\s*(?=,|$)`).exec(inner);
		return m ? Number(m[1]) : null;
	}
	const start = angle('start angle');
	const end = angle('end angle') ?? (start === null ? null : start + (angle('delta angle') ?? NaN));
	if (!r || start === null || end === null || Number.isNaN(end)) return null;
	return { start, end, value: Number(r[1]), at: from + 1 + r.index + r[0].lastIndexOf(r[1]), length: r[1].length };
}

/** the arcs drawn straight from a point of the statement's own, each around the center that puts it there */
export function arcRadii(source: string, st: Statement): ArcSpan[] {
	const text = source.slice(st.from, st.to);
	const points = pathPoints(source, st);
	return [...text.matchAll(ARC)].flatMap((m) => {
		const at = st.from + m.index!;
		const before = points.filter((p) => p.to <= at).at(-1);
		// another arc, or a named point, between them moves the current point
		if (!before || /arc|\(/.test(source.slice(before.to, at))) return [];
		const arc = readArc(m[1], at + m[0].length - m[1].length);
		if (!arc) return [];
		const a = (arc.start * Math.PI) / 180;
		const center = { x: before.x - arc.value * Math.cos(a), y: before.y - arc.value * Math.sin(a) };
		return [{ from: arc.at, to: arc.at + arc.length, value: arc.value, axis: 'r' as const, center, start: arc.start, end: arc.end }];
	});
}

/** a bend turned the other way when a stretch flips the path, so its mirror image bulges to the same side */
export function mirroredBendEdits(source: string, st: Statement, sx: number, sy: number): TextEdit[] {
	if (sx * sy >= 0) return [];
	const text = source.slice(st.from, st.to);
	return [...text.matchAll(/\bbend (left|right)\b/g)].map((m) => {
		const from = st.from + m.index! + 'bend '.length;
		return { from, to: from + m[1].length, text: m[1] === 'left' ? 'right' : 'left' };
	});
}
