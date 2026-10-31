import type { PointSpan, RadiusSpan } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import type { CetzStatement } from './picture';
import { closingBracket, readNumber, readPair, splitArgs } from './syntax';

const PLAIN_PAIR = /\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/g;

export function writePair([x, y]: Point) {
	return `(${formatNumber(x)}, ${formatNumber(y)})`;
}

// a decoration drawn along a path it is given: its points are the path's
const ALONG = new Set(['coil', 'zigzag', 'wave']);

/** the arguments a statement's points are written in: its own positional ones, or those of the path a decoration
 *  follows, `decorations.coil(line((0, 0), (2, 0)))` */
export function drawnArgs(source: string, st: CetzStatement) {
	const positional = st.args.filter((a) => !a.name);
	const inner = ALONG.has(st.command) ? positional[0] : null;
	const call = inner && /^line\s*\(/.exec(source.slice(inner.value.from, inner.value.to));
	if (!inner || !call) return positional;
	const open = inner.value.from + call[0].length - 1;
	return splitArgs(source, open, closingBracket(source, open)).filter((a) => !a.name);
}

/** the points as written: positional `(x, y)` arguments with plain numbers; named and relative ones are not its to move */
export function writtenPoints(source: string, st: CetzStatement): PointSpan[] {
	if (st.kind !== 'path' && st.kind !== 'node' && st.kind !== 'frame') return [];
	const out: PointSpan[] = [];
	const positional = drawnArgs(source, st);
	const closed = st.command === 'line' && st.args.some((a) => a.name === 'close' && source.slice(a.value.from, a.value.to) === 'true');
	const lined = st.command === 'line' || ALONG.has(st.command);
	for (const [k, a] of positional.entries()) {
		const p = readPair(source.slice(a.value.from, a.value.to));
		if (!p) continue;
		// how the point before it reaches it, as TikZ's `--` and `rectangle` do; a curve's controls are beside it
		const joined = k && lined ? 'line' : k === 1 && (st.command === 'rect' || st.command === 'grid') ? 'rectangle' : undefined;
		const aside = st.command === 'bezier' && k >= 2;
		const last = closed && k === positional.length - 1 && k > 1;
		out.push({
			from: a.value.from,
			to: a.value.to,
			x: p[0],
			y: p[1],
			...(joined && { joined }),
			...(aside && { aside }),
			...(last && { closedTo: 0 })
		});
	}
	return out;
}

export function shiftPoints(source: string, points: PointSpan[], du: number, dv: number) {
	let out = source;
	for (const p of [...points].sort((a, b) => b.from - a.from))
		out = out.slice(0, p.from) + writePair([p.x + du, p.y + dv]) + out.slice(p.to);
	return out;
}

/** one point moved to `to`; a node's middle, which stands for its whole outline, moves the outline */
export function movePoint(source: string, points: PointSpan[], k: number, to: Point) {
	const p = points[k];
	if (readPair(source.slice(p.from, p.to))) return source.slice(0, p.from) + writePair(to) + source.slice(p.to);
	const [du, dv] = [to[0] - p.x, to[1] - p.y];
	return (
		source.slice(0, p.from) +
		source.slice(p.from, p.to).replace(PLAIN_PAIR, (pair) => {
			const [x, y] = readPair(pair)!;
			return writePair([x + du, y + dv]);
		}) +
		source.slice(p.to)
	);
}

/** a circle's `radius: r`, or `radius: (rx, ry)` for an ellipse, around its first point */
export function radii(source: string, st: CetzStatement): RadiusSpan[] {
	if (st.command !== 'circle') return [];
	const center = writtenPoints(source, st)[0];
	const radius = st.args.find((a) => a.name === 'radius');
	if (!center || !radius) return [];
	const text = source.slice(radius.value.from, radius.value.to);
	const r = readNumber(text);
	if (r !== null) return [{ ...radius.value, value: r, axis: 'r', center, centerPoint: 0 }];
	const pair = readPair(text);
	if (!pair) return [];
	// the two numbers inside the parentheses, each its own handle
	const inner = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/.exec(text)!;
	const xFrom = radius.value.from + text.indexOf(inner[1]);
	const yFrom = radius.value.from + text.indexOf(inner[2], text.indexOf(inner[1]) + inner[1].length);
	return [
		{ from: xFrom, to: xFrom + inner[1].length, value: pair[0], axis: 'x', center, centerPoint: 0 },
		{ from: yFrom, to: yFrom + inner[2].length, value: pair[1], axis: 'y', center, centerPoint: 0 }
	];
}
