import type { ArcSpans, TrimmableShape, TrimmedShape, TrimRun } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber, formatPoint } from '$lib/draw/editor/figure/numbers';
import { pathPoints, radii } from '../coordinates';
import { pointName } from '../dimensions/dimensionNames';
import { readRotation } from '../moves/rotation';
import { nodeName, readNodeBox } from '../nodes';
import { readCommandOptions, writeCommandOptions } from '../options/optionList';
import { ALL_DASHES, ALL_WIDTHS, isArrowSpec, readStyle } from '../options/styleOptions';
import type { Statement } from '../picture';
import { escapeRegExp, indentAt } from '../sourceText';

const ROUND = /^\\draw\s*P\s*(?:circle|ellipse)\s*(?:\[[^\]]*\]|\([^)]*\))\s*;$/;
// what a node draws its outline with, kept when the outline is written as a path
const LINE_KEYS = /^(line width|dash pattern|dash phase|draw opacity|opacity)\s*=/;
const SAME = 1e-6;

/** the statement with its options and point names left out, and each point written as P */
function skeleton(source: string, st: Statement) {
	const options = readCommandOptions(source, st)?.span;
	const cuts = [...(options ? [{ from: options.from, to: options.to, text: '' }] : [])];
	for (const p of pathPoints(source, st)) if (!p.aside) cuts.push({ from: p.from, to: p.to, text: 'P' });
	let text = source.slice(st.from, st.to);
	for (const c of cuts.sort((a, b) => b.from - a.from)) text = text.slice(0, c.from - st.from) + c.text + text.slice(c.to - st.from);
	return text.replace(/\+\+?P/g, 'P').replace(/\s*coordinate\s*\([^)]*\)/g, '');
}

/** the runs of lines a path draws, `P -- P -- cycle P rectangle P ...`; null for a path that draws anything else. A
 *  point on its own, as a name left where a piece was cut, draws nothing */
function readRuns(text: string, points: Point[]): TrimRun[] | null {
	const body = /^\\draw\s*([\s\S]*?)\s*;$/.exec(text)?.[1];
	if (body === undefined || body.replace(/P|--|cycle|rectangle|\s/g, '') !== '') return null;
	const runs: TrimRun[] = [];
	let k = 0;
	let joint: string | null = null;
	for (const token of body.match(/P|--|cycle|rectangle/g) ?? []) {
		const run = runs.at(-1);
		if (token === 'P') {
			const at = points[k++];
			if (joint === '--' && run && !run.closed) run.points.push(at);
			else if (joint === 'rectangle' && run?.points.length === 1) {
				const [[x1, y1]] = run.points;
				run.points.push([at[0], y1], at, [x1, at[1]]);
				run.closed = true;
			} else if (joint === null) runs.push({ points: [at], closed: false });
			else return null;
			joint = null;
		} else if (token === 'cycle') {
			if (joint !== '--' || !run || run.points.length < 3) return null;
			run.closed = true;
			joint = null;
		} else if (joint === null && run) joint = token;
		else return null;
	}
	const drawn = runs.filter((r) => r.points.length > 1);
	return joint === null && drawn.length ? drawn : null;
}

function optionValue(options: string, key: string) {
	const m = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*(-?\\d*\\.?\\d+)`).exec(options);
	return m ? Number(m[1]) : null;
}

/** the arcs of one ellipse a path draws, `P arc[start angle=.., end angle=.., radius=..] ...`, as a trim leaves them */
function readArcs(text: string, points: Point[]) {
	const body = /^\\draw\s*([\s\S]*?)\s*;$/.exec(text)?.[1];
	if (body === undefined || body.replace(/P\s*arc\s*\[[^\]]*\]|P|\s/g, '') !== '') return null;
	const arcs: { center: Point; rx: number; ry: number; span: [number, number] }[] = [];
	let k = 0;
	for (const m of body.matchAll(/P(?:\s*arc\s*\[([^\]]*)\])?/g)) {
		const at = points[k++];
		if (m[1] === undefined) continue;
		const [s0, s1] = [optionValue(m[1], 'start angle'), optionValue(m[1], 'end angle')];
		const r = optionValue(m[1], 'radius');
		const [rx, ry] = [optionValue(m[1], 'x radius') ?? r, optionValue(m[1], 'y radius') ?? r];
		if (s0 === null || s1 === null || !rx || !ry) return null;
		const t = (s0 * Math.PI) / 180;
		const [lo, hi] = s0 < s1 ? [s0, s1] : [s1, s0];
		arcs.push({ center: [at[0] - rx * Math.cos(t), at[1] - ry * Math.sin(t)], rx, ry, span: [lo, hi] });
	}
	const [first] = arcs;
	const one = arcs.every(
		(a) => Math.hypot(a.center[0] - first.center[0], a.center[1] - first.center[1]) < 1e-3 && a.rx === first.rx && a.ry === first.ry
	);
	return first && one
		? { kind: 'ellipse' as const, center: first.center, rx: first.rx, ry: first.ry, spans: arcs.map((a) => a.span) as ArcSpans }
		: null;
}

/** lines, rectangles, circles and ellipses a path draws; a node's outline, which TeX's drawing gives */
export function trimmable(source: string, st: Statement): TrimmableShape | null {
	if (st.kind === 'node') {
		const items = readCommandOptions(source, st)?.items ?? [];
		const drawn = items.some((i) => /^draw\b/.test(i) && !/^draw\s*=\s*none$/.test(i));
		const shape = readNodeBox(source, st)?.shape;
		return drawn && !readRotation(source, st) ? { kind: 'node', round: shape === 'circle' || shape === 'ellipse' } : null;
	}
	if (st.kind !== 'path') return null;
	const points = pathPoints(source, st);
	if (points.some((p) => p.aside || p.polar)) return null;
	const text = skeleton(source, st);
	const at = points.map((p): Point => [p.x, p.y]);
	const runs = readRuns(text, at);
	if (runs) return { kind: 'polyline', runs };
	const arcs = readArcs(text, at);
	if (arcs) return arcs;
	if (!ROUND.test(text)) return null;
	const sizes = radii(source, st);
	const rx = sizes.find((r) => r.axis !== 'y')?.value;
	const ry = sizes.find((r) => r.axis !== 'x')?.value;
	return rx && ry ? { kind: 'ellipse', center: at[0], rx, ry } : null;
}

/** a node's outline color, width and dash, as a path's options */
function outlineOptions(items: string[]) {
	const stroke = readStyle(items, 'node').stroke;
	const kept = items.filter((i) => LINE_KEYS.test(i) || ALL_WIDTHS.includes(i) || ALL_DASHES.includes(i));
	return [...(stroke && stroke !== 'black' ? [stroke] : []), ...kept];
}

/** the names the path's points carry, `coordinate (D1)`, which a dimension measures them by */
function pointNames(source: string, st: Statement) {
	return pathPoints(source, st).flatMap((p, k) => {
		const name = pointName(source, st, k);
		return name ? [{ name, at: [p.x, p.y] as Point }] : [];
	});
}

/** what is left, each name after the point it was given to, or, where that point was cut away, on its own */
function leftText(left: TrimmedShape, names: { name: string; at: Point }[]) {
	const placed = new Set<string>();
	function point(p: Point) {
		const own = names.filter((n) => !placed.has(n.name) && Math.hypot(n.at[0] - p[0], n.at[1] - p[1]) < SAME);
		for (const n of own) placed.add(n.name);
		return formatPoint(p) + own.map((n) => ` coordinate (${n.name})`).join('');
	}
	let text: string;
	if (left.kind === 'polyline') {
		text = left.runs.map((run) => run.points.map(point).join(' -- ') + (run.closed ? ' -- cycle' : '')).join(' ');
	} else {
		const { center, rx, ry } = left;
		const size = Math.abs(rx - ry) < 1e-9 ? `radius=${formatNumber(rx)}` : `x radius=${formatNumber(rx)}, y radius=${formatNumber(ry)}`;
		text = left.spans
			.map(([s0, s1]) => {
				const t = (s0 * Math.PI) / 180;
				const from: Point = [center[0] + rx * Math.cos(t), center[1] + ry * Math.sin(t)];
				return `${point(from)} arc[start angle=${formatNumber(s0)}, end angle=${formatNumber(s1)}, ${size}]`;
			})
			.join(' ');
	}
	const rest = names.filter((n) => !placed.has(n.name));
	return text + rest.map((n) => ` ${formatPoint(n.at)} coordinate (${n.name})`).join('');
}

/** the arrow tips at ends a trim cut away taken off, `<->` with its end cut becoming `<-` */
function tipsKept(items: string[], start: boolean, end: boolean) {
	return items.flatMap((item) => {
		if (!isArrowSpec(item)) return [item];
		// the dash between the two tips, outside any braces
		let depth = 0;
		let at = -1;
		for (let k = 0; k < item.length && at < 0; k++) {
			depth += item[k] === '{' ? 1 : item[k] === '}' ? -1 : 0;
			if (item[k] === '-' && depth === 0) at = k;
		}
		const spec = `${start ? item.slice(0, at) : ''}-${end ? item.slice(at + 1) : ''}`;
		return spec === '-' ? [] : [spec];
	});
}

function samePoint(a: Point | undefined, b: Point | undefined) {
	return !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < SAME;
}

/** whether anything else in the source names the node, a dimension or an arrow, so it has to stay */
function isReferred(source: string, st: Statement) {
	const name = nodeName(source, st);
	if (!name) return false;
	const elsewhere = source.slice(0, st.from) + source.slice(st.to);
	return new RegExp(`\\(\\s*${escapeRegExp(name)}\\s*[).]|\\bof\\s+${escapeRegExp(name)}\\b|\\b${escapeRegExp(name)}\\.`).test(elsewhere);
}

/** the node without its outline: its text, its name and its size stay for what refers to them */
function outlineless(source: string, st: Statement) {
	const options = readCommandOptions(source, st);
	if (!options) return source.slice(st.from, st.to);
	const written = writeCommandOptions(
		source,
		options,
		options.items.filter((i) => !/^draw\b/.test(i))
	);
	return written.slice(st.from, st.to + written.length - source.length);
}

/** the statement as what is left of it, drawn as it was; a node's outline becomes a path, after the node itself where
 *  it has text or a name something refers to */
export function writeTrimmed(source: string, st: Statement, left: TrimmedShape) {
	const options = readCommandOptions(source, st);
	if (st.kind !== 'node') {
		const was = trimmable(source, st);
		const items = options?.items ?? [];
		const kept =
			was?.kind === 'polyline' && left.kind === 'polyline'
				? tipsKept(
						items,
						samePoint(was.runs[0].points[0], left.runs[0]?.points[0]),
						samePoint(was.runs.at(-1)?.points.at(-1), left.runs.at(-1)?.points.at(-1))
					)
				: items;
		const own = kept.length ? `[${kept.join(', ')}]` : '';
		return `${source.slice(0, st.from)}\\draw${own} ${leftText(left, pointNames(source, st))};${source.slice(st.to)}`;
	}
	const items = outlineOptions(options?.items ?? []);
	const outline = `\\draw${items.length ? `[${items.join(', ')}]` : ''} ${leftText(left, [])};`;
	const text = /\{\s*\S[\s\S]*\}\s*;$/.test(source.slice(st.from, st.to));
	const kept = text || isReferred(source, st) ? `${outlineless(source, st)}\n${indentAt(source, st.from)}` : '';
	return `${source.slice(0, st.from)}${kept}${outline}${source.slice(st.to)}`;
}
