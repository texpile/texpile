import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { readCommandOptions, writeCommandOptions } from '../options/optionList';
import type { Statement } from '../picture';

const SHIFT = /^shift\s*=\s*\{?\s*\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)\s*\}?$/;

/** moved by a `shift` first in its options, before its own transforms, in its own coordinates */
export function shiftByOption(source: string, st: Statement, du: number, dv: number) {
	const options = readCommandOptions(source, st);
	if (!options) return source;
	const m = options.items.length ? SHIFT.exec(options.items[0]) : null;
	const [u, v] = m ? [Number(m[1]) + du, Number(m[2]) + dv] : [du, dv];
	const shift = `shift={(${formatNumber(u)},${formatNumber(v)})}`;
	const rest = m ? options.items.slice(1) : options.items;
	return writeCommandOptions(source, options, shift === 'shift={(0,0)}' ? rest : [shift, ...rest]);
}

const SCALE = { x: /^xscale\s*=\s*(-?\d*\.?\d+)$/, y: /^yscale\s*=\s*(-?\d*\.?\d+)$/ };

/**
 * Stretched about `anchor` by (sx, sy) with options first in its own: a shift, then an xscale and a yscale, which a
 * path with no points of its own to scale (a plot of a function) stretches by, and later stretches fold into
 */
export function stretchByOption(source: string, st: Statement, [qx, qy]: readonly [number, number], sx: number, sy: number) {
	const options = readCommandOptions(source, st);
	if (!options) return source;
	const items = [...options.items];
	const shift = items.length ? SHIFT.exec(items[0]) : null;
	if (shift) items.shift();
	const [ux, uy] = shift ? [Number(shift[1]), Number(shift[2])] : [0, 0];
	const bx = SCALE.x.exec(items[0] ?? '');
	const ax = bx ? Number(bx[1]) : 1;
	if (bx) items.shift();
	const by = SCALE.y.exec(items[0] ?? '');
	const ay = by ? Number(by[1]) : 1;
	if (by) items.shift();
	// the stretch is in the coordinates the points are written in: about q, so u + D q stays where it is
	const [nx, ny] = [ux + ax * qx * (1 - sx), uy + ay * qy * (1 - sy)];
	const prefix = [
		...(Math.abs(nx) > 1e-9 || Math.abs(ny) > 1e-9 ? [`shift={(${formatNumber(nx)},${formatNumber(ny)})}`] : []),
		...(Math.abs(ax * sx - 1) > 1e-9 ? [`xscale=${formatNumber(ax * sx)}`] : []),
		...(Math.abs(ay * sy - 1) > 1e-9 ? [`yscale=${formatNumber(ay * sy)}`] : [])
	];
	return writeCommandOptions(source, options, [...prefix, ...items]);
}
