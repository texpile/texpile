import type { FigureDimension, PointRef } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { readElementRef, writeElementRef } from '../nodes/nodeAnchors';
import { ensureNodeName, nodeName } from '../nodes/nodeNames';
import { writePair } from '../coordinates';
import { appendStatement } from '../newStatements';
import { pathPoints } from '../nodes/nodePoint';
import { namedArg, readPicture, type CetzPicture, type CetzStatement } from '../picture';
import { closingBracket, splitArgs, type Arg } from '../syntax';
import { typedText, typstText } from '../typstText';
import { withTexpile } from '../../texpile';
import { withCetzModules } from '../pasted';
import { readStyle } from '../styles/styles';
import { angleText, readAngle } from './dimensionAngles';
import { namePoint, readPointRef } from './dimensionRefs';

function nameAll(source: string, pictureIndex: number, refs: PointRef[]) {
	let text = source;
	const names: string[] = [];
	for (const ref of refs) {
		const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === ref.stmt);
		const named = st && namePoint(text, st, ref.k);
		if (!named) return null;
		text = named.source;
		names.push(named.ref);
	}
	return { source: text, names };
}

function sameRef(a: PointRef, b: PointRef) {
	return a.stmt === b.stmt && a.k === b.k;
}

function corner(name: string, v: 'north' | 'south', h: 'west' | 'east', on: { source: string; st: CetzStatement }) {
	return `(${writeElementRef(name, v, on)}, "-|", ${writeElementRef(name, h, on)})`;
}

function crossing(source: string, pictureIndex: number, refs: PointRef[]) {
	const statements = readPicture(source, pictureIndex)?.statements ?? [];
	const at = refs.map((ref) => {
		const st = statements.find((s) => s.i === ref.stmt);
		return st ? pathPoints(source, st)[ref.k] : undefined;
	});
	if (at.some((p) => !p)) return null;
	const [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] = at.map((p) => [p!.x, p!.y]);
	const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
	if (Math.abs(den) < 1e-9) return null;
	const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
	return writePair([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
}

// the dimension's own arguments; any other, its stroke, is its style and stays when it is written again
const OWN = new Set(['kind', 'offset', 'radius', 'length', 'angle', 'value', 'label', 'at', 'label-radius', 'mark']);

export function dimensionStyle(source: string, st: CetzStatement) {
	return {
		kept: st.args.filter((a) => a.name && !OWN.has(a.name)).map((a) => source.slice(a.from, a.to)),
		paint: readStyle(source, st)?.stroke ?? 'black'
	};
}

type DimensionStyle = ReturnType<typeof dimensionStyle>;
const PLAIN: DimensionStyle = { kept: [], paint: 'black' };

function alongRay(vertex: string, a: string, b: string) {
	return a === vertex ? b : `(${vertex}, -1, ${a})`;
}

function call(args: (string | null)[], label: string | null, style: DimensionStyle) {
	const labelled = label === null ? [] : [`label: [${typstText(label)}]`];
	return `texpile-dimension(${[...args.filter((a) => a !== null), ...labelled, ...style.kept].join(', ')})`;
}

export function dimensionStatement(source: string, pictureIndex: number, d: FigureDimension, style = PLAIN) {
	const label = d.label === undefined ? null : d.label;
	const picture = readPicture(source, pictureIndex);
	if (!picture) return null;
	const n = formatNumber;
	if (d.kind === 'node') {
		const st = picture.statements.find((s) => s.i === d.stmt);
		const named = st && ensureNodeName(source, st);
		const now = named ? readPicture(named.source, pictureIndex)?.statements.find((s) => s.i === d.stmt) : null;
		if (!named || !now) return null;
		const on = { source: named.source, st: now };
		const [a, b] =
			d.axis === 'x'
				? [corner(named.name, d.side > 0 ? 'north' : 'south', 'west', on), corner(named.name, d.side > 0 ? 'north' : 'south', 'east', on)]
				: [corner(named.name, 'south', d.side > 0 ? 'east' : 'west', on), corner(named.name, 'north', d.side > 0 ? 'east' : 'west', on)];
		return { source: named.source, text: call([a, b, `kind: "${d.axis}"`, `offset: ${n(d.offset)}`], label, style) };
	}
	if (d.kind === 'radius') {
		const named = nameAll(source, pictureIndex, [d.center]);
		const args = [named?.names[0] ?? null, 'kind: "radius"', `length: ${n(d.length)}`, `angle: ${n(d.angle)}deg`, `value: ${n(d.value)}`];
		return named && { source: named.source, text: call(args, label, style) };
	}
	if (d.kind === 'angle') {
		const [[p, q], [r, s]] = d.lines;
		const named = nameAll(source, pictureIndex, [p, q, r, s]);
		if (!named) return null;
		const [np, nq, nr, ns] = named.names;
		const shared = [p, q].flatMap((u, i) => [r, s].flatMap((v) => (sameRef(u, v) ? [[np, nq][i]] : [])))[0];
		const [a1, b1] = d.rays[0] > 0 ? [np, nq] : [nq, np];
		const [a2, b2] = d.rays[1] > 0 ? [nr, ns] : [ns, nr];
		if (shared) {
			const rays: [string, string] = [alongRay(shared, a1, b1), alongRay(shared, a2, b2)];
			return { source: named.source, text: angleText(shared, rays, d.radius, label, style.paint, style.kept) };
		}
		const vertex = crossing(source, pictureIndex, [p, q, r, s]);
		if (!vertex) return null;
		const args = [a1, b1, a2, b2, 'kind: "angle"', `radius: ${n(d.radius)}`, `at: ${vertex}`];
		return { source: named.source, text: call(args, label, style) };
	}
	const named = nameAll(source, pictureIndex, [d.from, d.to]);
	if (!named) return null;
	const [a, b] = named.names;
	return {
		source: named.source,
		text: call([a, b, d.kind === 'aligned' ? null : `kind: "${d.kind}"`, `offset: ${n(d.offset)}`], label, style)
	};
}

export function addDimension(source: string, pictureIndex: number, d: FigureDimension): string | null {
	const written = dimensionStatement(source, pictureIndex, d);
	const picture = written && readPicture(written.source, pictureIndex);
	if (!picture) return null;
	const added = appendStatement(written.source, picture, written.text);
	return written.text.startsWith('angle.') ? withCetzModules(added, ['angle']) : withTexpile(added);
}

function numberArg(source: string, st: CetzStatement, name: string) {
	const text = namedArg(source, st, name)?.text.replace(/deg$/, '');
	return text === undefined ? null : Number(text);
}

function cornerOf(source: string, a: Arg) {
	if (source[a.value.from] !== '(' || closingBracket(source, a.value.from) !== a.value.to - 1) return null;
	const parts = splitArgs(source, a.value.from, a.value.to - 1).map((p) => source.slice(p.value.from, p.value.to));
	const m = parts.length === 3 && parts[1] === '"-|"' ? parts.map((p) => /^"([^".]+)\.([^"]+)"$/.exec(p)) : null;
	return m?.[0] && m[2] && m[0][1] === m[2][1] ? { name: m[0][1], v: m[0][2], h: m[2][2] } : null;
}

export function readDimension(source: string, picture: CetzPicture, st: CetzStatement): FigureDimension | null {
	if (st.command === 'angle') return readAngle(source, picture, st);
	if (st.command !== 'texpile-dimension') return null;
	const kind = namedArg(source, st, 'kind')?.text.replace(/"/g, '') ?? 'aligned';
	const positional = st.args.filter((a) => !a.name);
	function ref(k: number) {
		return positional[k] ? readPointRef(source, picture, source.slice(positional[k].value.from, positional[k].value.to)) : null;
	}
	const body = namedArg(source, st, 'label')?.text;
	const label = body?.startsWith('[') ? { label: typedText(body.slice(1, -1)) } : {};
	const offset = numberArg(source, st, 'offset') ?? 0.5;
	const corners = positional.slice(0, 2).map((a) => cornerOf(source, a));
	if ((kind === 'x' || kind === 'y') && corners[0] && corners[1]) {
		const node = picture.statements.find((s) => s.kind === 'node' && nodeName(source, s) === corners[0]!.name);
		if (!node) return null;
		const [v, h] = [corners[0].v, corners[0].h].map((a) => readElementRef(`"${corners[0]!.name}.${a}"`, { source, st: node })?.anchor);
		const side = kind === 'x' ? (v === 'north' ? 1 : -1) : h === 'east' ? 1 : -1;
		return { kind: 'node', stmt: node.i, axis: kind, side, offset, ...label };
	}
	if (kind === 'radius') {
		const center = ref(0);
		const [length, angle] = [numberArg(source, st, 'length'), numberArg(source, st, 'angle')];
		const value = numberArg(source, st, 'value') ?? length;
		return center && length !== null && angle !== null && value !== null
			? { kind: 'radius', center, length, value, angle, ...label }
			: null;
	}
	if (kind === 'angle') {
		const [a1, b1, a2, b2] = [0, 1, 2, 3].map(ref);
		const radius = numberArg(source, st, 'radius') ?? 1;
		return a1 && b1 && a2 && b2
			? {
					kind: 'angle',
					lines: [
						[a1, b1],
						[a2, b2]
					],
					rays: [1, 1],
					radius,
					...label
				}
			: null;
	}
	const [from, to] = [ref(0), ref(1)];
	if (!from || !to || (kind !== 'aligned' && kind !== 'x' && kind !== 'y')) return null;
	return { kind, from, to, offset, ...label };
}

export function relabelDimension(source: string, pictureIndex: number, i: number, label: string | null) {
	const picture = readPicture(source, pictureIndex);
	const st = picture?.statements.find((s) => s.i === i);
	const d = picture && st && readDimension(source, picture, st);
	if (!st || !d) return null;
	const now = dimensionStatement(source, pictureIndex, { ...d, label: label ?? undefined }, dimensionStyle(source, st));
	return now?.source === source ? source.slice(0, st.from) + now.text + source.slice(st.to) : null;
}

export function restyledDimension(source: string, pictureIndex: number, i: number) {
	const picture = readPicture(source, pictureIndex);
	const st = picture?.statements.find((s) => s.i === i);
	const d = picture && st?.command === 'angle' ? readDimension(source, picture, st) : null;
	const now = st && d && dimensionStatement(source, pictureIndex, d, dimensionStyle(source, st));
	return st && now?.source === source ? source.slice(0, st.from) + now.text + source.slice(st.to) : source;
}

export function refreshDimensions(before: string, after: string, pictureIndex: number) {
	const was = readPicture(before, pictureIndex);
	const now = readPicture(after, pictureIndex);
	if (!was || !now || was.statements.length !== now.statements.length) return after;
	let text = after;
	for (const st of [...now.statements].reverse()) {
		const old = was.statements.find((s) => s.i === st.i);
		const d = old ? readDimension(before, was, old) : null;
		const written = d && dimensionStatement(text, pictureIndex, d, dimensionStyle(text, st));
		if (written && written.source === text) text = text.slice(0, st.from) + written.text + text.slice(st.to);
	}
	return text;
}
