import type { FigureDimension, PointRef } from '$lib/draw/editor/figure/figureLanguage';
import { appendPastedStatements } from '../inserts/newStatements';
import { withLibrary } from '../options/libraries';
import { readCommandOptions } from '../options/optionList';
import { listPictures, readPicture, type Picture, type Statement } from '../picture';
import { texText, typedText } from '../sourceText';
import { findName, namePoint } from './dimensionNames';
import { alignedText, angleText, axisText, DIMENSION_STYLE, radiusText } from './dimensionText';

/** the names of the points, each given one in turn where it has none; null where one cannot have a name */
function nameAll(source: string, pictureIndex: number, refs: PointRef[]) {
	let text = source;
	const names: string[] = [];
	for (const ref of refs) {
		const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === ref.stmt);
		const named = st && namePoint(text, st, ref.k);
		if (!named) return null;
		text = named.source;
		names.push(named.name);
	}
	return { source: text, names };
}

/** the picture's own options define `dimension` once */
export function withDimensionStyle(source: string, pictureIndex: number) {
	const at = listPictures(source)[pictureIndex]?.from;
	if (at === undefined) return source;
	const begin = /^\\begin\{(tikzpicture|circuitikz)\}\s*/.exec(source.slice(at));
	if (!begin) return source;
	const after = at + begin[0].length;
	const head = `\\begin{${begin[1]}}`;
	if (source[after] !== '[') return `${source.slice(0, at)}${head}[${DIMENSION_STYLE}]${source.slice(at + head.length)}`;
	let depth = 0;
	let end = after;
	for (; end < source.length; end++) {
		if (source[end] === '[' || source[end] === '{') depth++;
		if (source[end] === ']' || source[end] === '}') depth--;
		if (depth === 0) break;
	}
	const own = source.indexOf('dimension/.style', after);
	if (own >= 0 && own < end) {
		// one written by an earlier version of the editor is brought up to date
		const open = source.indexOf('{', own);
		let close = open;
		for (let d = 0; close < end; close++) {
			if (source[close] === '{') d++;
			if (source[close] === '}' && --d === 0) break;
		}
		return `${source.slice(0, own)}${DIMENSION_STYLE}${source.slice(close + 1)}`;
	}
	const inner = source.slice(after + 1, end).trim();
	return `${source.slice(0, after + 1)}${inner ? `${source.slice(after + 1, end)}, ` : ''}${DIMENSION_STYLE}${source.slice(end)}`;
}

/** a corner of the box around a node: a round node's own corner anchors lie on its outline */
function corner(name: string, v: 'north' | 'south', h: 'west' | 'east') {
	return `${name}.${v} -| ${name}.${h}`;
}

function nodeAnchors(name: string, axis: 'x' | 'y', side: 1 | -1): [string, string] {
	if (axis === 'x')
		return side > 0
			? [corner(name, 'north', 'west'), corner(name, 'north', 'east')]
			: [corner(name, 'south', 'west'), corner(name, 'south', 'east')];
	return side > 0
		? [corner(name, 'south', 'east'), corner(name, 'north', 'east')]
		: [corner(name, 'south', 'west'), corner(name, 'north', 'west')];
}

function sameRef(a: PointRef, b: PointRef) {
	return a.stmt === b.stmt && a.k === b.k;
}

/** the dimension's statement, with the names of its ends; null where they cannot be named */
export function dimensionStatement(source: string, pictureIndex: number, d: FigureDimension) {
	const label = d.label === undefined ? null : texText(d.label);
	if (d.kind === 'node') {
		const st = readPicture(source, pictureIndex)?.statements.find((s) => s.i === d.stmt);
		const named = st && namePoint(source, st, 0);
		if (!named) return null;
		const [a, b] = nodeAnchors(named.name, d.axis, d.side);
		return { source: named.source, text: axisText(a, b, d.axis, d.offset, true, label) };
	}
	if (d.kind === 'radius') {
		const named = nameAll(source, pictureIndex, [d.center]);
		return named && { source: named.source, text: radiusText(named.names[0], d.length, d.value, d.angle, label) };
	}
	if (d.kind === 'angle') {
		const [[p, q], [r, s]] = d.lines;
		const named = nameAll(source, pictureIndex, [p, q, r, s]);
		if (!named) return null;
		const [np, nq, nr, ns] = named.names;
		const shared = [p, q].flatMap((u, i) => [r, s].flatMap((v) => (sameRef(u, v) ? [[np, nq][i]] : [])))[0];
		const vertex = shared ?? `intersection of ${np}--${nq} and ${nr}--${ns}`;
		const first: [string, string] = d.rays[0] > 0 ? [np, nq] : [nq, np];
		const second: [string, string] = d.rays[1] > 0 ? [nr, ns] : [ns, nr];
		return { source: named.source, text: angleText(vertex, first, second, d.radius, label) };
	}
	const named = nameAll(source, pictureIndex, [d.from, d.to]);
	if (!named) return null;
	const [a, b] = named.names;
	return {
		source: named.source,
		text: d.kind === 'aligned' ? alignedText(a, b, d.offset, label) : axisText(a, b, d.kind, d.offset, false, label)
	};
}

export function addDimension(source: string, pictureIndex: number, d: FigureDimension): string | null {
	const written = dimensionStatement(source, pictureIndex, d);
	const appended = written && appendPastedStatements(written.source, pictureIndex, written.text);
	return appended ? withLibrary(withDimensionStyle(appended, pictureIndex), 'calc').source : null;
}

const NAME = String.raw`([^()]+?)`;
const NUM = String.raw`(-?\d*\.?\d+)`;

function isDimension(source: string, st: Statement) {
	return st.kind === 'path' && !!readCommandOptions(source, st)?.items.includes('dimension');
}

// the options a dimension's own text writes; any other, its color, is the style it was given
const OWN_OPTIONS = new Set(['dimension', '->', '<->']);

/** a dimension's text with the style of the statement it is written over */
export function keepingStyle(source: string, st: Statement, text: string) {
	const given = readCommandOptions(source, st)?.items.filter((o) => !OWN_OPTIONS.has(o)) ?? [];
	return given.length ? text.replace(/^\\draw\[([^\]]*)\]/, (_, own: string) => `\\draw[${own}, ${given.join(', ')}]`) : text;
}

function refOf(source: string, picture: Picture, name: string) {
	return findName(source, picture.statements, name.trim());
}

/** what the dimension prints in place of its value, if anything: the text of its last node */
function labelOf(text: string) {
	const open = [...text.matchAll(/\bnode\s*(?:\[[^\]]*\])?\s*\{/g)].at(-1);
	if (!open) return undefined;
	const from = open.index + open[0].length;
	let to = from;
	for (let depth = 1; to < text.length; to++) {
		if (text[to] === '{') depth++;
		if (text[to] === '}' && --depth === 0) break;
	}
	const content = text.slice(from, to);
	return /^\\pgfmathparse\b|^R -?\d*\.?\d+$/.test(content) ? undefined : typedText(content);
}

/** a dimension statement read back: its kind, its ends by the points they name, where it sits and what it prints */
export function readDimension(source: string, picture: Picture, st: Statement): FigureDimension | null {
	const found = readMeasured(source, picture, st);
	const label = found ? labelOf(source.slice(st.from, st.to)) : undefined;
	return found && label !== undefined ? { ...found, label } : found;
}

/** dimension `i` printing `label`, or what it measures again with null */
export function relabelDimension(source: string, pictureIndex: number, i: number, label: string | null) {
	const picture = readPicture(source, pictureIndex);
	const st = picture?.statements.find((s) => s.i === i);
	const d = picture && st && readDimension(source, picture, st);
	if (!st || !d) return null;
	const now = dimensionStatement(source, pictureIndex, { ...d, label: label ?? undefined });
	return now?.source === source ? source.slice(0, st.from) + keepingStyle(source, st, now.text) + source.slice(st.to) : null;
}

function readMeasured(source: string, picture: Picture, st: Statement): FigureDimension | null {
	if (!isDimension(source, st)) return null;
	const text = source.slice(st.from, st.to);
	// a node's corner as written now, `n.south -| n.west`, or as an earlier version wrote it, `n.south west`
	const node = /\(\$\(([^().]+)\.(north|south)(?: -\| [^().]+\.| )(west|east)\)\+\((0|-?\d*\.?\d+cm),(0|-?\d*\.?\d+cm)\)\$\) edge/.exec(
		text
	);
	if (node) {
		const ref = refOf(source, picture, node[1]);
		const axis = node[4] === '0' ? 'x' : 'y';
		const offset = Number.parseFloat(axis === 'x' ? node[5] : node[4]);
		const side = axis === 'x' ? (node[2] === 'north' ? 1 : -1) : node[3] === 'east' ? 1 : -1;
		return ref && { kind: 'node', stmt: ref.stmt, axis, side, offset };
	}
	const angle = new RegExp(
		String.raw`\\p0 = \((.+?)\), \\p1 = \(\$\(${NAME}\)-\(${NAME}\)\$\), \\p2 = \(\$\(${NAME}\)-\(${NAME}\)\$\).*radius=${NUM}cm\]`
	).exec(text);
	if (angle) {
		const [b1, a1, b2, a2] = [angle[2], angle[3], angle[4], angle[5]].map((n) => refOf(source, picture, n));
		const radius = Number(angle[6]);
		return a1 && b1 && a2 && b2
			? {
					kind: 'angle',
					lines: [
						[a1, b1],
						[a2, b2]
					],
					rays: [1, 1],
					radius
				}
			: null;
	}
	const radius = new RegExp(
		String.raw`^\\draw\[dimension, ->(?:, [^\]]*)?\] \(${NAME}\) -- \+\+\(${NUM}:${NUM}\) node\[anchor=${NUM}\] \{(?:R ${NUM}\})?`
	).exec(text);
	if (radius) {
		const center = refOf(source, picture, radius[1]);
		// one that prints a label has its length to read as its value
		const length = Number(radius[3]);
		return center && { kind: 'radius', center, length, value: radius[5] ? Number(radius[5]) : length, angle: Number(radius[2]) };
	}
	const aligned = new RegExp(String.raw`\(\$\(${NAME}\)!${NUM}cm!90:\(${NAME}\)\$\) edge`).exec(text);
	if (aligned) {
		const [from, to] = [refOf(source, picture, aligned[1]), refOf(source, picture, aligned[3])];
		return from && to ? { kind: 'aligned', from, to, offset: Number(aligned[2]) } : null;
	}
	for (const axis of ['x', 'y'] as const) {
		const start = new RegExp(String.raw`\(\$\(${NAME}\)\+\(${axis === 'x' ? `0,${NUM}cm` : `${NUM}cm,0`}\)\$\) edge`).exec(text);
		const other = new RegExp(String.raw`\(\$\(${NAME} ${axis === 'x' ? '\\|-' : '-\\|'} ${NAME}\)\+`).exec(text);
		if (!start || !other) continue;
		const [from, to] = [refOf(source, picture, start[1]), refOf(source, picture, other[1])];
		return from && to ? { kind: axis, from, to, offset: Number(start[2]) } : null;
	}
	return null;
}
