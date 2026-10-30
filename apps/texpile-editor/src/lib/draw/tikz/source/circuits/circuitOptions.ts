import type { CircuitPart, TextSpan } from '$lib/draw/editor/figure/figureLanguage';
import { nodeOptionLists, splitItems } from '../options/optionList';
import type { Statement } from '../picture';
import { partOf } from '../reader/syntaxParts';
import { circuitPart, isBipole } from './circuitParts';

/** a part as written: its option list, and which item names its type */
type WrittenPart = CircuitPart & { list: TextSpan; items: string[]; typeAt: number };
type PartChange = Partial<Omit<CircuitPart, 'placed'>>;

const MARKS = { label: /^l[_^]?$/, voltage: /^v[_^<>]*$/, current: /^i[_^<>]*$/ } as const;
const NEW_KEYS = { label: 'l', voltage: 'v', current: 'i' } as const;

function keyOf(item: string) {
	const k = item.indexOf('=');
	return (k < 0 ? item : item.slice(0, k)).trim();
}
function valueOf(item: string) {
	const k = item.indexOf('=');
	if (k < 0) return null;
	const value = item.slice(k + 1).trim();
	return /^\{[^{}]*\}$/.test(value) ? value.slice(1, -1) : value;
}
// a value with a comma or an equals sign of its own is braced, so the list still splits where it should
function written(value: string) {
	return /[,=\]]/.test(value.replace(/\{[^{}]*\}|\$[^$]*\$/g, '')) ? `{${value}}` : value;
}

function markValue(items: string[], mark: RegExp) {
	const item = items.find((i) => mark.test(keyOf(i)));
	return item ? valueOf(item) : null;
}

/** a node part in this option list, as `\\node[ground]` or a node on a path writes it */
function nodePart(list: TextSpan, items: string[]): WrittenPart[] {
	const typeAt = items.findIndex((i) => circuitPart(i)?.placed === 'node');
	return typeAt < 0 ? [] : [{ type: items[typeAt], placed: 'node', label: null, voltage: null, current: null, list, items, typeAt }];
}

function pathParts(source: string, st: Statement): WrittenPart[] {
	if (st.kind !== 'path') return [];
	return st.parts.flatMap((p) => {
		const list = p.type === 'to' || p.type === 'node' ? partOf(p.parts, 'options') : null;
		if (list && p.type === 'node') return nodePart(list, splitItems(source.slice(list.from + 1, list.to - 1)));
		if (!list) return [];
		const items = splitItems(source.slice(list.from + 1, list.to - 1));
		const typeAt = items.findIndex((i) => isBipole(keyOf(i)));
		if (typeAt < 0) return [];
		return [
			{
				type: keyOf(items[typeAt]),
				placed: 'path' as const,
				// `R=$R_1$` is circuitikz's short way to label a part
				label: valueOf(items[typeAt]) ?? markValue(items, MARKS.label),
				voltage: markValue(items, MARKS.voltage),
				current: markValue(items, MARKS.current),
				list: { from: list.from, to: list.to },
				items,
				typeAt
			}
		];
	});
}

function writtenParts(source: string, st: Statement) {
	if (st.kind !== 'node') return pathParts(source, st);
	return nodeOptionLists(source, st)
		.flatMap((o) => (o.span ? nodePart(o.span, o.items) : []))
		.slice(0, 1);
}

export function readCircuit(source: string, st: Statement): CircuitPart[] {
	return writtenParts(source, st).map(({ type, placed, label, voltage, current }) => ({ type, placed, label, voltage, current }));
}

/** one of a part's marks set, or taken off with null; a shorthand label stays where it was written */
function withMark(items: string[], typeAt: number, key: keyof typeof NEW_KEYS, value: string | null) {
	const out = [...items];
	if (key === 'label' && valueOf(out[typeAt]) !== null) {
		const type = keyOf(out[typeAt]);
		out[typeAt] = value ? `${type}=${written(value)}` : type;
		return out;
	}
	const at = out.findIndex((i) => MARKS[key].test(keyOf(i)));
	if (at < 0) return value ? [...out, `${NEW_KEYS[key]}=${written(value)}`] : out;
	if (value) out[at] = `${keyOf(out[at])}=${written(value)}`;
	else out.splice(at, 1);
	return out;
}

export function writeCircuit(source: string, st: Statement, k: number, change: PartChange) {
	const part = writtenParts(source, st)[k];
	if (!part) return null;
	let items = [...part.items];
	if (change.type) {
		const kind = circuitPart(change.type);
		const fits = part.placed === 'node' ? kind?.placed === 'node' : isBipole(change.type);
		if (!fits) return null;
		const value = part.placed === 'path' ? valueOf(items[part.typeAt]) : null;
		items[part.typeAt] = value === null ? change.type : `${change.type}=${written(value)}`;
	}
	for (const key of ['label', 'voltage', 'current'] as const)
		if (key in change && part.placed === 'path') items = withMark(items, part.typeAt, key, change[key]?.trim() || null);
	return `${source.slice(0, part.list.from)}[${items.join(', ')}]${source.slice(part.list.to)}`;
}

/** a picture with circuit parts in it */
export function isCircuit(source: string, statements: Statement[]) {
	return statements.some((s) => writtenParts(source, s).length > 0);
}
