import type { Connector, ConnectorLabel, ConnectorRoute, Endpoint, TextSpan } from '$lib/draw/editor/figure/figureLanguage';
import { formatPoint } from '$lib/draw/editor/figure/numbers';
import { splitItems } from './options/optionList';
import { ensureNodeName } from './nodes';
import { readPicture, type Statement } from './picture';
import { partOf, type SyntaxPart } from './reader/syntaxParts';
import { texText, typedText } from './sourceText';

type EndSpan = TextSpan & { node: string | null; anchor: string | null };
/** a label node as written: its options and its text, so a new text or side is written in place */
type LabelSpan = ConnectorLabel &
	TextSpan & { other: string[]; items: string[]; sideItem: string | null; options: TextSpan | null; textAt: TextSpan };
/** where on the path a label node is written: after its first point, on the way, or after its last */
type LabelPlace = 'start' | 'middle' | 'end';
type ReadConnector = { ends: [EndSpan, EndSpan]; route: ConnectorRoute; bend: string | null; middle: string; label: LabelSpan | null };

const NAMED = /^\(\s*([A-Za-z][\w-]*)(?:\.\s*([A-Za-z]+(?: [a-z]+)?|\d+|[-+]))?\s*\)$/;
const PLAIN = /^\(\s*-?\d*\.?\d+\s*[,:]\s*-?\d*\.?\d+\s*(?:cm)?\s*\)$/;
const OPS: Record<string, ConnectorRoute> = { '--': 'straight', '-|': 'hv', '|-': 'vh' };
const POSITIONS = ['at start', 'near start', 'midway', 'near end', 'at end'] as const;
// a label with no place of its own is where it is written: TikZ puts one written after a point at that point
const PLACED: Record<LabelPlace, ConnectorLabel['pos']> = { start: 'at start', middle: 'midway', end: 'at end' };
const SIDES = ['above', 'below', 'left', 'right'] as const;
// `below left` and the like, which the inspector shows as no side of its own
const ANY_SIDE = /^(?:(?:above|below)(?:\s+(?:left|right))?|left|right)$/;

function endOf(source: string, c: SyntaxPart): EndSpan | null {
	const text = source.slice(c.from, c.to);
	const named = NAMED.exec(text);
	if (named) return { from: c.from, to: c.to, node: named[1], anchor: named[2] ?? null };
	return PLAIN.test(text) ? { from: c.from, to: c.to, node: null, anchor: null } : null;
}

/** a `pos=` as the nearest place the inspector offers */
function nearestPlace(value: number): ConnectorLabel['pos'] {
	return POSITIONS[Math.min(4, Math.max(0, Math.round(value * 4)))];
}

function labelOf(source: string, n: SyntaxPart, span: TextSpan, place: LabelPlace): LabelSpan | null {
	const group = partOf(n.parts, 'text');
	if (!group) return null;
	// the first of what qualifies the node, when it is its options
	const list = n.parts[1]?.type === 'options' ? n.parts[1] : null;
	const items = list ? splitItems(source.slice(list.from + 1, list.to - 1)) : [];
	const at = /^pos\s*=\s*(-?[\d.]+)$/.exec(items.find((i) => /^pos\s*=/.test(i)) ?? '');
	const pos = POSITIONS.find((p) => items.includes(p)) ?? (at ? nearestPlace(Number(at[1])) : PLACED[place]);
	const sideItem = items.find((i) => ANY_SIDE.test(i)) ?? null;
	const side = SIDES.find((s) => s === sideItem) ?? null;
	const other = items.filter((i) => i !== sideItem && !(POSITIONS as readonly string[]).includes(i) && !/^pos\s*=/.test(i));
	const text = typedText(source.slice(group.from + 1, group.to - 1));
	return { ...span, text, pos, side, other, items, sideItem, options: list, textAt: group };
}

/**
 * A path from one end to another: each a node by name, perhaps at an anchor, or a plain point, joined by `--`, `-|`,
 * `|-`, `to[bend ...]` or a curve, with at most one label node
 */
function parse(source: string, st: Statement): ReadConnector | null {
	if (st.kind !== 'path' || !/^\\(draw|path)$/.test(st.command)) return null;
	const items = [...st.parts];
	if (items[0]?.type === 'options') items.shift();
	let label: LabelSpan | null = null;
	function take(n: SyntaxPart, span: TextSpan, place: LabelPlace) {
		if (label) return false;
		label = labelOf(source, n, span, place);
		return !!label;
	}
	const lastPoint = items.reduce((at, item, k) => (item.type === 'node' ? at : k), -1);
	let before = 0;
	const kept = items.filter((item, k) => {
		if (item.type !== 'node') before++;
		return item.type !== 'node' || !take(item, item, before <= 1 ? 'start' : k > lastPoint ? 'end' : 'middle');
	});
	if (kept.length < 2 || kept[0].type !== 'point') return null;
	const start = endOf(source, kept[0]);
	if (!start) return null;
	const op = kept[1];
	if (op.type === 'to') {
		if (kept.length !== 2) return null;
		const target = partOf(op.parts, 'target')?.parts[0];
		const end = target?.type === 'point' ? endOf(source, target) : null;
		const inner = partOf(op.parts, 'node');
		if (!end || (inner && !take(inner, { from: inner.from, to: inner.to }, 'middle'))) return null;
		const options = partOf(op.parts, 'options');
		const text = options ? source.slice(options.from, options.to) : '';
		const loop = /\bloop (above|below|left|right)\b/.exec(text);
		const bend = /bend (left|right)(?:\s*=\s*([\d.]+))?/.exec(text);
		if (!loop && !bend) return null;
		const route = (loop ? `loop ${loop[1]}` : `bend ${bend![1]}`) as ConnectorRoute;
		return { ends: [start, end], route, bend: bend?.[2] ?? null, middle: source.slice(start.to, end.from), label };
	}
	const last = kept.at(-1)!;
	const end = last.type === 'point' ? endOf(source, last) : null;
	if (!end || op.type !== 'operator') return null;
	const opText = source.slice(op.from, op.to);
	if (OPS[opText] && kept.length === 3) return { ends: [start, end], route: OPS[opText], bend: null, middle: '', label };
	// a curve: `.. controls (c1) and (c2) ..`, written back as it was
	const between = source.slice(start.to, end.from);
	if (opText === '..' && /^\s*\.\.\s*controls\b[^;]*\.\.\s*$/.test(withoutLabels(between)))
		return { ends: [start, end], route: 'curve', bend: null, middle: between, label };
	return null;
}

/** where the group opened at `at` closes, nested groups counted */
function groupEnd(text: string, at: number, open: string, close: string) {
	let depth = 0;
	for (let k = at; k < text.length; k++) {
		if (text[k] === '\\') k++;
		else if (text[k] === open) depth++;
		else if (text[k] === close && --depth === 0) return k + 1;
	}
	return -1;
}

/** the text without its `node[...] {...}` labels, the first `most` of them, braces in their text counted */
function withoutLabels(text: string, most = Infinity) {
	let out = text;
	for (let n = 0, from = 0; n < most; n++) {
		const m = /\s*node\s*\[/g;
		m.lastIndex = from;
		const found = m.exec(out);
		if (!found) break;
		const options = groupEnd(out, found.index + found[0].length - 1, '[', ']');
		const brace = options < 0 ? -1 : out.indexOf('{', options);
		if (brace < 0 || out.slice(options, brace).trim()) break;
		const end = groupEnd(out, brace, '{', '}');
		if (end < 0) break;
		out = out.slice(0, found.index) + out.slice(end);
		from = found.index;
	}
	return out;
}

export function readConnector(source: string, st: Statement): Connector | null {
	const c = parse(source, st);
	if (!c) return null;
	function end({ node, anchor }: EndSpan) {
		return { node, anchor };
	}
	const label = c.label && { text: c.label.text, pos: c.label.pos, side: c.label.side };
	// TikZ bends by 30 degrees when it is not told how far
	const bend = c.route.startsWith('bend') ? Number(c.bend ?? 30) : null;
	return { ends: [end(c.ends[0]), end(c.ends[1])], route: c.route, bend, label };
}

function routeText(c: ReadConnector, route: ConnectorRoute, bend: string | null) {
	if (route === 'curve') return c.route === 'curve' ? withoutLabels(c.middle).trim() : '--';
	if (route === 'bend left' || route === 'bend right') return `to[${route}${bend ? `=${bend}` : ''}]`;
	if (route.startsWith('loop')) return `to[${route}]`;
	return Object.keys(OPS).find((k) => OPS[k] === route)!;
}

function labelText(label: ConnectorLabel, other: string[]) {
	const items = [label.pos, ...(label.side ? [label.side] : []), ...other];
	return ` node[${items.join(', ')}] {${texText(label.text)}}`;
}

/** the label's text and side written where the label is, as it is written; its place and its other options kept */
function relabeled(source: string, label: LabelSpan, next: ConnectorLabel) {
	const at = label.items.findIndex((i) => i === label.sideItem);
	const items = [...label.items];
	if (next.side !== label.side) {
		if (at >= 0 && next.side) items[at] = next.side;
		else if (at >= 0) items.splice(at, 1);
		else if (next.side) items.unshift(next.side);
	}
	const options = items.length ? `[${items.join(', ')}]` : '';
	const text = `{${texText(next.text)}}`;
	if (label.options)
		return (
			source.slice(0, label.options.from) +
			options +
			source.slice(label.options.to, label.textAt.from) +
			text +
			source.slice(label.textAt.to)
		);
	return source.slice(0, label.textAt.from) + `${options}${options ? ' ' : ''}${text}` + source.slice(label.textAt.to);
}

/** the route and the label rewritten: everything from the first end to the statement's end is written anew, unless only
 *  the label's text or side changes, which is written in place */
export function writeConnector(
	source: string,
	st: Statement,
	change: { route?: ConnectorRoute; bend?: number; label?: ConnectorLabel | null }
) {
	const c = parse(source, st);
	if (!c) return null;
	const only = change.route === undefined && change.bend === undefined;
	if (only && c.label && change.label && change.label.pos === c.label.pos) return relabeled(source, c.label, change.label);
	const route = change.route ?? c.route;
	const label = change.label === undefined ? c.label : change.label;
	// a side the inspector does not offer stays with the label until another is picked
	const kept = c.label?.sideItem && !c.label.side && label && !label.side ? [c.label.sideItem] : [];
	const other = [...kept, ...(c.label?.other ?? [])];
	const close = source.lastIndexOf(';', st.to);
	const after = close > c.ends[1].to ? withoutLabels(source.slice(c.ends[1].to, close), 1) : '';
	const bend = change.bend === undefined ? c.bend : change.bend === 30 ? null : String(change.bend);
	const tail = ` ${routeText(c, route, bend)} ${source.slice(c.ends[1].from, c.ends[1].to)}${label ? labelText(label, other) : ''}${after}`;
	return source.slice(0, c.ends[0].to) + tail + source.slice(close);
}

/** where an end goes: a node by name, at an anchor or its border, or a point */
export type EndTarget = { node: string; anchor: string | null } | { at: [number, number] };

export function writeConnectorEnd(source: string, st: Statement, k: 0 | 1, to: EndTarget) {
	const c = parse(source, st);
	if (!c) return null;
	const end = c.ends[k];
	const text = 'at' in to ? formatPoint(to.at) : `(${to.node}${to.anchor ? `.${to.anchor}` : ''})`;
	return source.slice(0, end.from) + text + source.slice(end.to);
}

/** the connector's end k moved: onto a node, named in the same edit when it has no name yet, or to a point; both ends
 *  on one node is a loop, and a loop pulled off its node is a line again */
export function attachConnectorEnd(source: string, pictureIndex: number, i: number, k: 0 | 1, to: Endpoint) {
	let text = source;
	let target: EndTarget = { at: to as [number, number] };
	if ('ref' in to) {
		const node = readPicture(text, pictureIndex)?.statements.find((s) => s.i === to.ref);
		if (!node) return null;
		const ensured = ensureNodeName(text, node);
		text = ensured.source;
		target = { node: ensured.name, anchor: to.anchor ?? null };
	}
	const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === i);
	const moved = st && writeConnectorEnd(text, st, k, target);
	if (!moved) return null;
	const after = readPicture(moved, pictureIndex)?.statements.find((s) => s.i === i);
	const c = after && readConnector(moved, after);
	if (!c || !after) return moved;
	const self = !!c.ends[0].node && c.ends[0].node === c.ends[1].node;
	const loop = c.route.startsWith('loop');
	if (self === loop) return moved;
	return writeConnector(moved, after, { route: self ? 'loop above' : 'straight' }) ?? moved;
}
