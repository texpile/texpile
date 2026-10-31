import { callPrefix } from '../nodes/nodeBox';
import type { TrimmableShape, TrimmedShape } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writtenPoints, radii, writePair } from '../coordinates';
import { nodeName } from '../nodes/nodeNames';
import { contentTextSpan } from '../nodes/nodeText';
import { namedArg, pictureAround, type CetzStatement } from '../picture';
import { readStyle, setNamedArg } from '../styles/styles';
import { closingBracket, splitArgs } from '../syntax';
import { arcAngles, arcRadii } from './arcs';

const SAME = 1e-6;
// what makes a shape the shape it is, which what is left of it is written without
const GEOMETRY = new Set(['close', 'radius', 'start', 'stop', 'delta', 'mode']);

function samePoint(a: Point | undefined, b: Point | undefined) {
	return !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < SAME;
}

/** every point it is placed by written as plain numbers, which a cut can be measured on */
function plainlyPlaced(source: string, st: CetzStatement) {
	return st.args.filter((a) => !a.name).length === writtenPoints(source, st).length;
}

/** lines, rectangles, circles and ellipses and arcs of one; a node's outline, which Typst's drawing gives */
export function trimmable(source: string, st: CetzStatement): TrimmableShape | null {
	if (st.turn) return null;
	if (st.kind === 'node') {
		const round =
			st.text || st.command === 'finite-state'
				? st.command !== 'rect' && st.command !== 'line'
				: namedArg(source, st, 'frame')?.text === '"circle"';
		return readStyle(source, st).stroke ? { kind: 'node', round } : null;
	}
	if (st.kind !== 'path' || !plainlyPlaced(source, st)) return null;
	const at = writtenPoints(source, st).map((p): Point => [p.x, p.y]);
	if (st.command === 'line') return { kind: 'polyline', runs: [{ points: at, closed: namedArg(source, st, 'close')?.text === 'true' }] };
	if (st.command === 'rect' && at.length === 2) {
		const [[x1, y1], [x2, y2]] = at;
		const points: Point[] = [
			[x1, y1],
			[x2, y1],
			[x2, y2],
			[x1, y2]
		];
		return { kind: 'polyline', runs: [{ points, closed: true }] };
	}
	if (st.command === 'circle') {
		const sizes = radii(source, st);
		const rx = sizes.find((r) => r.axis !== 'y')?.value;
		const ry = sizes.find((r) => r.axis !== 'x')?.value;
		return rx && ry ? { kind: 'ellipse', center: at[0], rx, ry } : null;
	}
	const arc = arcRadii(source, st)[0];
	const angles = arc && arcAngles(source, st);
	if (!arc || !angles) return null;
	const [lo, hi] = angles[0] < angles[1] ? angles : [angles[1], angles[0]];
	return { kind: 'ellipse', center: [arc.center.x, arc.center.y], rx: arc.value, ry: arc.value, spans: [[lo, hi]] };
}

/** the mark at an end cut away taken off, `(start: ">", end: ">")` with its end cut becoming `(start: ">")` */
function marksKept(source: string, st: CetzStatement, start: boolean, end: boolean) {
	const mark = namedArg(source, st, 'mark');
	if (!mark || source[mark.arg.value.from] !== '(' || closingBracket(source, mark.arg.value.from) !== mark.arg.value.to - 1)
		return mark?.text ?? null;
	const kept = splitArgs(source, mark.arg.value.from, mark.arg.value.to - 1).filter(
		(a) => !(a.name === 'start' && !start) && !(a.name === 'end' && !end)
	);
	const ends = kept.filter((a) => a.name === 'start' || a.name === 'end' || a.name === 'symbol');
	return ends.length ? `(${kept.map((a) => source.slice(a.from, a.to)).join(', ')})` : null;
}

/** what is left, each run a line and each span an arc of the ellipse, in the style given */
function pieces(prefix: string, left: TrimmedShape, style: string[]) {
	const rest = style.length ? `, ${style.join(', ')}` : '';
	if (left.kind === 'polyline')
		return left.runs.map((run) => `${prefix}line(${run.points.map(writePair).join(', ')}${run.closed ? ', close: true' : ''}${rest})`);
	const { center, rx, ry } = left;
	const radius = Math.abs(rx - ry) < 1e-9 ? formatNumber(rx) : `(${formatNumber(rx)}, ${formatNumber(ry)})`;
	return left.spans.map(([s0, s1]) => {
		const t = (s0 * Math.PI) / 180;
		const from: Point = [center[0] + rx * Math.cos(t), center[1] + ry * Math.sin(t)];
		return `${prefix}arc(${writePair(from)}, start: ${formatNumber(s0)}deg, stop: ${formatNumber(s1)}deg, radius: ${radius}${rest})`;
	});
}

/** whether anything else in the picture names the node, so it has to stay */
function isReferred(source: string, st: CetzStatement) {
	const name = nodeName(source, st);
	const picture = pictureAround(source, st)?.picture;
	if (!name || !picture) return false;
	const elsewhere = source.slice(picture.from, st.from) + source.slice(st.to, picture.to);
	return new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[."]`).test(elsewhere);
}

function lineIndent(source: string, pos: number) {
	return /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', pos - 1) + 1))![0];
}

/** the statement as what is left of it, drawn as it was; a node's outline becomes lines and arcs after the node,
 *  which stays without its border where it has text or a name something refers to */
export function writeTrimmed(source: string, st: CetzStatement, left: TrimmedShape) {
	const prefix = callPrefix(source, st);
	if (st.kind !== 'node') {
		const was = trimmable(source, st);
		const kept =
			was?.kind === 'polyline' && left.kind === 'polyline'
				? marksKept(
						source,
						st,
						samePoint(was.runs[0].points[0], left.runs[0]?.points[0]),
						samePoint(was.runs.at(-1)?.points.at(-1), left.runs.at(-1)?.points.at(-1))
					)
				: (namedArg(source, st, 'mark')?.text ?? null);
		const style = st.args
			.filter((a) => a.name && !GEOMETRY.has(a.name) && a.name !== 'mark')
			.map((a) => source.slice(a.from, a.to))
			.concat(kept ? [`mark: ${kept}`] : []);
		const [first, ...more] = pieces(prefix, left, style);
		const others = more.map((p) => p.replace(/, name: "[^"]*"/, ''));
		const label = st.text ? `; ${source.slice(st.text.from, st.text.to)}` : '';
		return `${source.slice(0, st.from)}${[first + label, ...others].join('; ')}${source.slice(st.to)}`;
	}
	const stroke = namedArg(source, st, 'stroke');
	const outline = pieces(prefix, left, stroke ? [source.slice(stroke.arg.from, stroke.arg.to)] : []).join('; ');
	const span = contentTextSpan(source, st);
	const keep = (!!span?.to && !!source.slice(span.from, span.to).trim()) || !!readStyle(source, st).fill || isReferred(source, st);
	if (!keep) return `${source.slice(0, st.from)}${outline}${source.slice(st.to)}`;
	// its border goes; a frame with no background goes with it
	const framed = !st.text && !readStyle(source, st).fill;
	let text = source;
	if (framed) for (const name of ['padding', 'frame', 'stroke']) text = removeArg(text, st, name);
	else text = setNamedArg(source, st, 'stroke', 'none');
	const end = st.to + text.length - source.length;
	return `${text.slice(0, end)}\n${lineIndent(text, st.from)}${outline}${text.slice(end)}`;
}

/** the named argument taken off, read again in the text as it is */
function removeArg(source: string, st: CetzStatement, name: string) {
	const around = pictureAround(source, st);
	const now = around?.picture.statements.find((s) => s.i === st.i) ?? st;
	return setNamedArg(source, now, name, null);
}
