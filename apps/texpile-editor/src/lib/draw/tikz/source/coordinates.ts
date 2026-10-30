import type { Statement } from './picture';
import type { PointSpan, RadiusSpan } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber, formatPoint } from '$lib/draw/editor/figure/numbers';
import { plotPoints } from './plots/axisStatements';
import type { SyntaxPart } from './reader/syntaxParts';
import { applyTextEdits, type TextEdit } from './sourceText';

const XY = /^\s*(-?\d*\.?\d+)\s*(cm)?\s*,\s*(-?\d*\.?\d+)\s*(cm)?\s*$/;
const POLAR = /^\s*(-?\d*\.?\d+)\s*:\s*(-?\d*\.?\d+)\s*(cm)?\s*$/;
const DEG = Math.PI / 180;

type WrittenForm = Pick<PointSpan, 'polar' | 'cm'>;

const NUM = String.raw`(-?\d*\.?\d+)\s*(?:cm)?`;
// what turns a `to` into a curve
const CURVED = /\b(bend|in|out|looseness|loop|controls)\b/;
// what draws its points on a path without being a way between them
const ON_THE_WAY = new Set(['node', 'pic', 'coordinate', 'at']);

const RADIUS_FORMS: [RegExp, ('r' | 'x' | 'y')[]][] = [
	[new RegExp(String.raw`circle\s*\[\s*radius\s*=\s*${NUM}\s*\]`, 'g'), ['r']],
	[new RegExp(String.raw`circle\s*\(\s*${NUM}\s*\)`, 'g'), ['r']],
	[new RegExp(String.raw`ellipse\s*\[\s*x radius\s*=\s*${NUM}\s*,\s*y radius\s*=\s*${NUM}\s*\]`, 'g'), ['x', 'y']],
	[new RegExp(String.raw`ellipse\s*\(\s*${NUM}\s+and\s+${NUM}\s*\)`, 'g'), ['x', 'y']]
];

export function readVector(text: string): ({ v: [number, number] } & WrittenForm) | null {
	const xy = text.match(XY);
	if (xy && !xy[2] === !xy[4]) return { v: [Number(xy[1]), Number(xy[3])], polar: false, cm: !!xy[2] };
	const polar = text.match(POLAR);
	if (!polar) return null;
	const [a, r] = [Number(polar[1]) * DEG, Number(polar[2])];
	return { v: [r * Math.cos(a), r * Math.sin(a)], polar: true, cm: !!polar[3] };
}

/** a vector as coordinate text, in the form the point was written in */
export function writeVector([u, v]: [number, number], { polar, cm }: WrittenForm = {}) {
	const unit = cm ? 'cm' : '';
	if (!polar) return cm ? `(${formatNumber(u)}cm,${formatNumber(v)}cm)` : formatPoint([u, v]);
	const angle = Math.atan2(v, u) / DEG;
	return `(${formatNumber(Math.abs(angle) < 1e-9 ? 0 : angle)}:${formatNumber(Math.hypot(u, v))}${unit})`;
}

/**
 * The statement's points written with numbers, in path order, each where it lands: plain `(x,y)` and polar
 * `(a:r)` points, and `+`/`++` ones while the current point is known. Named and computed points, arcs and
 * cycles make the current point unknown, and the relative points after them are not the editor's to move.
 */
export function pathPoints(source: string, st: Statement): PointSpan[] {
	if (st.kind === 'axis' || st.kind === 'plot') return plotPoints(source, st);
	const found: PointSpan[] = [];
	let current: [number, number] | null = [0, 0];
	let owner: number | null = null;
	// a circle's or ellipse's size in parentheses is not a point; control points do not move the current point
	let size = false;
	let controls = false;
	let join: PointSpan['joined'];
	// where the subpath started, which a `-- cycle` goes back to
	let start: number | null = null;
	function lose() {
		current = null;
		owner = null;
	}
	function walk(parts: SyntaxPart[], placement: boolean) {
		for (const c of parts) {
			const text = source.slice(c.from, c.to);
			switch (c.type) {
				case 'nodeName':
					continue;
				case 'options':
					size = false;
					if (join === 'line' && CURVED.test(text)) join = undefined;
					continue;
				case 'keyword':
					if (text === 'circle' || text === 'ellipse') size = true;
					if (text === 'cycle' && join === 'line' && start !== null && found.length) found[found.length - 1].closedTo = start;
					if (text === 'arc' || text === 'cycle') lose();
					if (text === 'controls') controls = true;
					if (!ON_THE_WAY.has(text)) join = text === 'rectangle' || text === 'grid' ? 'rectangle' : text === 'to' ? 'line' : undefined;
					continue;
				case 'operator':
					if (text === '..') controls = false;
					join = text === '--' ? 'line' : undefined;
					continue;
				// an edge, a pic or a let leaves the current point where it was
				case 'placement':
				case 'edge':
				case 'pic':
				case 'let':
					walk(c.parts, true);
					continue;
				case 'point': {
					if (size) {
						size = false;
						continue;
					}
					const r = readVector(text.slice(1, -1));
					const keeps = placement || controls;
					if (!r) {
						if (!keeps) lose();
						continue;
					}
					const joined = keeps ? undefined : join;
					join = undefined;
					if (!keeps && !joined) start = found.length;
					found.push({
						from: c.from,
						to: c.to,
						x: r.v[0],
						y: r.v[1],
						polar: r.polar,
						cm: r.cm,
						relative: '',
						base: [0, 0],
						followers: [],
						joined,
						...(keeps ? { aside: true } : {})
					});
					if (!keeps) {
						current = r.v;
						owner = found.length - 1;
					}
					continue;
				}
				case 'relative': {
					const prefix = text.startsWith('++') ? '++' : '+';
					const coord = c.parts.at(-1)!;
					const r = readVector(source.slice(coord.from + 1, coord.to - 1));
					const keeps = placement || controls;
					// a relative control point is measured from an end of the curve, not the current point
					if (!r || !current || keeps) {
						if (prefix === '++' && !keeps) lose();
						continue;
					}
					const base: [number, number] = current;
					const at: [number, number] = [base[0] + r.v[0], base[1] + r.v[1]];
					const joined = join;
					join = undefined;
					if (!joined) start = found.length;
					found.push({
						from: coord.from,
						to: coord.to,
						x: at[0],
						y: at[1],
						polar: r.polar,
						cm: r.cm,
						relative: prefix,
						base,
						followers: [],
						joined
					});
					if (owner !== null) found[owner].followers!.push(found.length - 1);
					if (prefix === '++') {
						current = at;
						owner = found.length - 1;
					}
					continue;
				}
				default:
					walk(c.parts, placement);
			}
		}
	}
	walk(st.parts, false);
	return found;
}

/** the statement's points of its own; the relative ones go with them when the statement moves */
export function absolutePoints(source: string, st: Statement): PointSpan[] {
	return pathPoints(source, st).filter((p) => !p.relative);
}

export function shiftPoints(source: string, points: PointSpan[], du: number, dv: number) {
	return applyTextEdits(
		source,
		points.map((p) => ({ from: p.from, to: p.to, text: writeVector([p.x + du, p.y + dv], p) }))
	).source;
}

/** one point moved to `to`, in source units; the points written from it are rewritten to stay where they are */
export function movePoint(source: string, points: PointSpan[], k: number, to: [number, number]) {
	const p = points[k];
	const base = p.base ?? [0, 0];
	const text = writeVector([to[0] - base[0], to[1] - base[1]], p);
	// the followers are measured from where the point is written, rounded, so they do not drift
	const written = readVector(text.slice(1, -1))!.v;
	const at = [base[0] + written[0], base[1] + written[1]];
	const edits = [{ from: p.from, to: p.to, text }];
	for (const f of p.followers ?? []) {
		const q = points[f];
		edits.push({ from: q.from, to: q.to, text: writeVector([q.x - at[0], q.y - at[1]], q) });
	}
	return applyTextEdits(source, edits).source;
}

/** relative points scale as offsets from where they are written from, so the shape stretches as a whole */
export function stretchPoints(
	source: string,
	points: PointSpan[],
	rims: RadiusSpan[],
	[au, av]: readonly [number, number],
	sx: number,
	sy: number,
	arcs: TextEdit[] = []
) {
	const edits: TextEdit[] = points.map((p) => {
		const [bu, bv] = p.relative ? p.base! : [au, av];
		const at: [number, number] = [(p.x - bu) * sx, (p.y - bv) * sy];
		return { from: p.from, to: p.to, text: writeVector(p.relative ? at : [au + at[0], av + at[1]], p) };
	});
	for (const r of rims) edits.push({ from: r.from, to: r.to, text: formatNumber(r.value * Math.abs(r.axis === 'y' ? sy : sx)) });
	return applyTextEdits(source, [...edits, ...arcs]).source;
}

/** the radii of a statement's circles and ellipses, each with the plain point it is drawn around */
export function radii(source: string, st: Statement): RadiusSpan[] {
	const text = source.slice(st.from, st.to);
	const points = pathPoints(source, st);
	const found: RadiusSpan[] = [];
	for (const [form, axes] of RADIUS_FORMS) {
		for (const m of text.matchAll(form)) {
			const at = st.from + m.index!;
			// drawn around the current point: the last plain point, unless another point (a named one) came after it
			const before = points.filter((p) => p.to <= at).at(-1);
			const center = before && !source.slice(before.to, at).includes('(') ? before : undefined;
			if (!center) continue;
			let cursor = m.index!;
			axes.forEach((axis, k) => {
				const from = st.from + text.indexOf(m[k + 1], cursor);
				cursor = from - st.from + m[k + 1].length;
				found.push({ from, to: from + m[k + 1].length, value: Number(m[k + 1]), axis, center, centerPoint: points.indexOf(center) });
			});
		}
	}
	return found;
}
