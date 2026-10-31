import { callPrefix } from '../nodes/nodeBox';
import type { Connector, ConnectorLabel, ConnectorRoute } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { readElementRef } from '../nodes/nodeAnchors';
import { nodeName } from '../nodes/nodeNames';
import { elementBox } from '../moves/placement';
import { bodyOf } from '../nodes/nodeText';
import { pictureAround, type CetzCall, type CetzPicture, type CetzStatement } from '../picture';
import { closingBracket, readPair, splitArgs, type Arg } from '../syntax';
import { typedText } from '../typstText';

/** an end as written: a named element, at an anchor or its border, or a point */
export type ConnectorEnd = { node: string | null; anchor: string | null; text: string };
export type ReadConnector = {
	ends: [ConnectorEnd, ConnectorEnd];
	route: ConnectorRoute;
	bend: number | null;
	/** a curve's control points, as written */
	controls: [string, string] | null;
	label: (ConnectorLabel & { other: string[] }) | null;
	/** its own arguments but its name, as written: its marks and stroke */
	style: string[];
	name: string | null;
	prefix: string;
};

/** where each loop leaves and comes back to its node, as TikZ's do */
export const LOOPS: Record<string, [number, number]> = {
	'loop above': [105, 75],
	'loop left': [195, 165],
	'loop below': [285, 255],
	'loop right': [15, 345]
};
export const LABEL_AT: Record<ConnectorLabel['pos'], string> = {
	'at start': '0%',
	'near start': '25%',
	midway: '50%',
	'near end': '75%',
	'at end': '100%'
};
export const LABEL_ANCHOR: Record<string, string> = { above: 'south', below: 'north', left: 'east', right: 'west' };

function textOf(source: string, a: Arg) {
	return source.slice(a.value.from, a.value.to);
}

/** the elements of a tuple coordinate, `("a", 39%, 30deg, "b")` */
function tuple(source: string, a: Arg) {
	if (source[a.value.from] !== '(' || closingBracket(source, a.value.from) !== a.value.to - 1) return null;
	return splitArgs(source, a.value.from, a.value.to - 1);
}

export function elementNamed(picture: CetzPicture, source: string, name: string) {
	return picture.statements.find((s) => (s.kind === 'node' || s.kind === 'path') && nodeName(source, s) === name) ?? null;
}

/** where an element is: its outline's middle, or where its text is placed, from the node it is placed beside */
export function elementCenter(source: string, st: CetzStatement): Point | null {
	const picture = pictureAround(source, st)?.picture;
	return (picture && elementBox(source, picture, st)?.center) ?? null;
}

function endOf(source: string, picture: CetzPicture, a: Arg): ConnectorEnd | null {
	const text = textOf(source, a);
	if (readPair(text)) return { node: null, anchor: null, text };
	const name = readElementRef(text)?.name;
	const on = name ? elementNamed(picture, source, name) : null;
	const ref = name ? readElementRef(text, on ? { source, st: on } : undefined) : null;
	return ref ? { node: ref.name, anchor: ref.anchor, text } : null;
}

function labelOf(source: string, call: CetzCall): ReadConnector['label'] {
	const [at, body] = call.args.filter((a) => !a.name);
	const span = bodyOf(source, call)?.text;
	if (!span || !body) return null;
	const place = /\.(.+)"$/.exec(textOf(source, at))?.[1] ?? '50%';
	const percent = place === 'start' ? 0 : place === 'end' ? 100 : place === 'mid' ? 50 : Number(place.replace('%', ''));
	const pos = (Object.entries(LABEL_AT) as [ConnectorLabel['pos'], string][]).reduce(
		(best, [p, at]) => (Math.abs(parseFloat(at) - percent) < Math.abs(parseFloat(LABEL_AT[best]) - percent) ? p : best),
		'midway' as ConnectorLabel['pos']
	);
	const anchor = call.args.find((a) => a.name === 'anchor');
	const side = Object.entries(LABEL_ANCHOR).find(([, v]) => anchor && textOf(source, anchor) === `"${v}"`)?.[0] ?? null;
	const other = call.args.filter((a) => a.name && a.name !== 'anchor' && a.name !== 'padding').map((a) => source.slice(a.from, a.to));
	return { text: typedText(source.slice(span.from, span.to)), pos, side: side as ConnectorLabel['side'], other };
}

/** a bend's control point, `(start, 39%, 30deg, end)`, and the angle it leaves at */
function bendAngle(source: string, a: Arg, from: string, to: string) {
	const parts = tuple(source, a);
	if (parts?.length !== 4 || textOf(source, parts[0]) !== from || textOf(source, parts[3]) !== to) return null;
	const m = /^(-?\d+(?:\.\d+)?)deg$/.exec(textOf(source, parts[2]));
	return m ? Number(m[1]) : null;
}

function loopOf(source: string, ends: [ConnectorEnd, ConnectorEnd], controls: Arg[]) {
	if (!ends[0].node || ends[0].node !== ends[1].node) return null;
	const angles = ends.map((e) => Number(/\.(-?\d+)deg"$/.exec(e.text)?.[1] ?? NaN));
	const rel = controls.every((c) => /^\(\s*rel\s*:/.test(textOf(source, c)));
	const found = Object.entries(LOOPS).find(([, [out, back]]) => out === angles[0] && back === angles[1]);
	return rel && found ? (found[0] as ConnectorRoute) : null;
}

/** a line or a curve from one end to another, each a named element or a point: straight, across then up through
 *  `("a", "-|", "b")`, bent through controls turned off the line between them, a loop, or a curve */
export function parseConnector(source: string, st: CetzStatement): ReadConnector | null {
	if (st.kind !== 'path' || (st.command !== 'line' && st.command !== 'bezier')) return null;
	if (st.args.some((a) => a.name === 'close')) return null;
	const picture = pictureAround(source, st)?.picture;
	const positional = st.args.filter((a) => !a.name);
	if (!picture || positional.length < 2) return null;
	const ends = [endOf(source, picture, positional[0]), endOf(source, picture, positional[1])];
	const style = st.args.filter((a) => a.name && a.name !== 'name').map((a) => source.slice(a.from, a.to));
	const name = nodeName(source, st);
	const prefix = callPrefix(source, st);
	const label = st.text ? labelOf(source, st.text) : null;
	const base = { style, name, prefix, label, controls: null, bend: null };
	if (st.command === 'line') {
		const last = endOf(source, picture, positional.at(-1)!);
		if (!ends[0] || !last) return null;
		const both: [ConnectorEnd, ConnectorEnd] = [ends[0], last];
		if (positional.length === 2) return { ...base, ends: both, route: 'straight' };
		const corner = positional.length === 3 ? tuple(source, positional[1]) : null;
		if (corner?.length !== 3 || textOf(source, corner[0]) !== both[0].text || textOf(source, corner[2]) !== both[1].text) return null;
		const op = textOf(source, corner[1]);
		return op === '"-|"' || op === '"|-"' ? { ...base, ends: both, route: op === '"-|"' ? 'hv' : 'vh' } : null;
	}
	if (positional.length !== 4 || !ends[0] || !ends[1]) return null;
	const both = ends as [ConnectorEnd, ConnectorEnd];
	const [c1, c2] = positional.slice(2);
	const loop = loopOf(source, both, [c1, c2]);
	if (loop) return { ...base, ends: both, route: loop };
	const out = bendAngle(source, c1, both[0].text, both[1].text);
	const back = bendAngle(source, c2, both[1].text, both[0].text);
	if (out !== null && back === -out && out)
		return { ...base, ends: both, route: out > 0 ? 'bend left' : 'bend right', bend: Math.abs(out) };
	if (!readPair(textOf(source, c1)) || !readPair(textOf(source, c2))) return null;
	return { ...base, ends: both, route: 'curve', controls: [textOf(source, c1), textOf(source, c2)] };
}

export function readConnector(source: string, st: CetzStatement): Connector | null {
	const c = parseConnector(source, st);
	if (!c) return null;
	const label = c.label && { text: c.label.text, pos: c.label.pos, side: c.label.side };
	return {
		ends: [
			{ node: c.ends[0].node, anchor: c.ends[0].anchor },
			{ node: c.ends[1].node, anchor: c.ends[1].anchor }
		],
		route: c.route,
		bend: c.bend,
		label
	};
}
