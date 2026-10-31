import type { ArcSpan } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writtenPoints } from '../coordinates';
import { namedArg, type CetzStatement } from '../picture';
import { readNumber, readPair } from '../syntax';

const DEGREES = /^(-?\d+(?:\.\d+)?)deg$/;

function degreesOf(source: string, st: CetzStatement, name: string) {
	const m = DEGREES.exec(namedArg(source, st, name)?.text ?? '');
	return m ? Number(m[1]) : null;
}

/** an arc's angles, from two of `start`, `stop` and `delta` */
export function arcAngles(source: string, st: CetzStatement) {
	const [start, stop, delta] = ['start', 'stop', 'delta'].map((n) => degreesOf(source, st, n));
	if (start !== null && stop !== null) return [start, stop] as const;
	if (start !== null && delta !== null) return [start, start + delta] as const;
	return stop !== null && delta !== null ? ([stop - delta, stop] as const) : null;
}

/** `arc(position, start: 0deg, stop: 90deg, radius: 1)` from its start point, around the center that puts it there */
export function arcRadii(source: string, st: CetzStatement): ArcSpan[] {
	const at = st.command === 'arc' ? writtenPoints(source, st)[0] : null;
	const angles = at ? arcAngles(source, st) : null;
	const radius = namedArg(source, st, 'radius');
	const r = radius && readNumber(radius.text);
	if (!at || !angles || !r || !radius) return [];
	const a = (angles[0] * Math.PI) / 180;
	const center = { x: at.x - r * Math.cos(a), y: at.y - r * Math.sin(a) };
	return [{ ...radius.arg.value, value: r, axis: 'r', center, start: angles[0], end: angles[1] }];
}

/** where an angle lands once the arc is mirrored by a negative scale */
function mirroredAngle(degrees: number, sx: number, sy: number) {
	if (sx < 0 && sy < 0) return degrees + 180;
	if (sx < 0) return 180 - degrees;
	return sy < 0 ? -degrees : degrees;
}

/** an arc's radius and angles stretched with its point: a circle's radius an ellipse's when the two scales differ */
export function arcStretchEdits(source: string, st: CetzStatement, sx: number, sy: number) {
	if (st.command !== 'arc') return [];
	const edits: { from: number; to: number; text: string }[] = [];
	const radius = namedArg(source, st, 'radius');
	const r = radius && readNumber(radius.text);
	const pair = radius && !r ? readPair(radius.text) : null;
	const [rx, ry] = r ? [r, r] : (pair ?? [0, 0]);
	if (radius && rx) {
		const [x, y] = [rx * Math.abs(sx), ry * Math.abs(sy)];
		const text = Math.abs(x - y) < 1e-9 ? formatNumber(x) : `(${formatNumber(x)}, ${formatNumber(y)})`;
		edits.push({ ...radius.arg.value, text });
	}
	for (const name of ['start', 'stop']) {
		const a = namedArg(source, st, name);
		const m = a && DEGREES.exec(a.text);
		if (a && m) edits.push({ ...a.arg.value, text: `${formatNumber(mirroredAngle(Number(m[1]), sx, sy))}deg` });
	}
	const delta = namedArg(source, st, 'delta');
	const d = delta && DEGREES.exec(delta.text);
	if (delta && d && sx < 0 !== sy < 0) edits.push({ ...delta.arg.value, text: `${formatNumber(-Number(d[1]))}deg` });
	return edits;
}
