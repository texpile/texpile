import type { ConnectorLabel, ConnectorRoute, Endpoint } from '$lib/draw/editor/figure/figureLanguage';
import { curveControls, type Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writePair } from '../coordinates';
import { writeBorderRef, writeElementRef } from '../nodes/nodeAnchors';
import { ensureNodeName, freshName } from '../nodes/nodeNames';
import { pictureAround, readPicture, type CetzPicture, type CetzStatement } from '../picture';
import { readPair } from '../syntax';
import { typstText } from '../typstText';
import {
	LABEL_ANCHOR,
	LABEL_AT,
	LOOPS,
	elementCenter,
	elementNamed,
	parseConnector,
	type ConnectorEnd,
	type ReadConnector
} from './connectorRead';

// TikZ's bends leave their line by this much of its length, at looseness 1
const BEND_REACH = '39%';
const LOOP_REACH = 1;

function degreesOf([x, y]: Point) {
	return (Math.atan2(y, x) * 180) / Math.PI;
}

/** an end as the route writes it: a named element at its anchor or border, or a point */
function endText(e: ConnectorEnd) {
	return e.node ? writeElementRef(e.node, e.anchor) : e.text;
}

function placeOf(source: string, picture: CetzPicture, e: ConnectorEnd) {
	if (!e.node) return { at: readPair(e.text), st: null };
	const st = elementNamed(picture, source, e.node);
	return { at: st && elementCenter(source, st), st };
}

/** an end met at its border going out at `degrees`, as TikZ's bent and looped lines meet a node; at its anchor when it has one */
function borderEnd(source: string, picture: CetzPicture, e: ConnectorEnd, degrees: number) {
	const place = placeOf(source, picture, e);
	if (!e.node || e.anchor || !place.st || !place.at) return endText(e);
	return writeBorderRef(e.node, degrees, { source, st: place.st, center: place.at });
}

function bendPoints(source: string, picture: CetzPicture, ends: [ConnectorEnd, ConnectorEnd], turn: number) {
	const [a, b] = ends.map((e) => placeOf(source, picture, e).at);
	const way = a && b ? degreesOf([b[0] - a[0], b[1] - a[1]]) : 0;
	const start = a && b ? borderEnd(source, picture, ends[0], way + turn) : endText(ends[0]);
	const end = a && b ? borderEnd(source, picture, ends[1], way + 180 - turn) : endText(ends[1]);
	const t = formatNumber(turn);
	return [start, end, `(${start}, ${BEND_REACH}, ${t}deg, ${end})`, `(${end}, ${BEND_REACH}, ${formatNumber(-turn)}deg, ${start})`];
}

function loopPoints(source: string, picture: CetzPicture, e: ConnectorEnd, route: ConnectorRoute) {
	const [out, back] = LOOPS[route];
	const plain = { ...e, anchor: null };
	const [start, end] = [borderEnd(source, picture, plain, out), borderEnd(source, picture, plain, back)];
	function reach(degrees: number) {
		const r = (degrees * Math.PI) / 180;
		return writePair([LOOP_REACH * Math.cos(r), LOOP_REACH * Math.sin(r)]);
	}
	return [start, end, `(rel: ${reach(out)}, to: ${start})`, `(rel: ${reach(back)}, to: ${end})`];
}

/** a curve met at each border on the way to its control, as TikZ's `.. controls ..` meets a node */
function curvePoints(source: string, picture: CetzPicture, c: ReadConnector) {
	const [a, b] = c.ends.map((e): Point => placeOf(source, picture, e).at ?? [0, 0]);
	const controls = c.controls ?? curveControls(a, b).map(writePair);
	const ends = c.ends.map((e, k) => {
		const [from, to] = [k === 0 ? a : b, readPair(controls[k])];
		return to ? borderEnd(source, picture, e, degreesOf([to[0] - from[0], to[1] - from[1]])) : endText(e);
	});
	return [...ends, ...controls];
}

/** what the route goes through, from its first end to its last */
function routePoints(source: string, picture: CetzPicture, c: ReadConnector, route: ConnectorRoute, bend: number) {
	const [a, b] = [endText(c.ends[0]), endText(c.ends[1])];
	if (route === 'straight') return [a, b];
	if (route === 'hv' || route === 'vh') return [a, `(${a}, "${route === 'hv' ? '-|' : '|-'}", ${b})`, b];
	if (route === 'bend left' || route === 'bend right') return bendPoints(source, picture, c.ends, route === 'bend left' ? bend : -bend);
	if (route.startsWith('loop')) return loopPoints(source, picture, c.ends[0], route);
	return curvePoints(source, picture, c);
}

function labelText(prefix: string, name: string, label: ConnectorLabel, other: string[]) {
	const anchor = label.side ? [`anchor: "${LABEL_ANCHOR[label.side]}"`] : [];
	const args = [`"${name}.${LABEL_AT[label.pos]}"`, `[${typstText(label.text)}]`, ...anchor, 'padding: 0.1', ...other];
	return `${prefix}content(${args.join(', ')})`;
}

/** the connector written again from its ends: its route through them, its label along it, its style kept */
function writeParsed(
	source: string,
	st: CetzStatement,
	c: ReadConnector,
	change: { route?: ConnectorRoute; bend?: number; label?: ConnectorLabel | null }
) {
	const picture = pictureAround(source, st)?.picture;
	if (!picture) return null;
	const route = change.route ?? c.route;
	const bend = change.bend ?? c.bend ?? 30;
	const label = change.label === undefined ? c.label : change.label;
	const command = route === 'straight' || route === 'hv' || route === 'vh' ? 'line' : 'bezier';
	const name = c.name ?? (label ? freshName(source) : null);
	const args = [...routePoints(source, picture, c, route, bend), ...c.style, ...(name ? [`name: "${name}"`] : [])];
	const call = `${c.prefix}${command}(${args.join(', ')})`;
	const text = label && name ? `${call}; ${labelText(c.prefix, name, label, c.label?.other ?? [])}` : call;
	return source.slice(0, st.inner.from) + text + source.slice(st.inner.to);
}

export function writeConnector(
	source: string,
	st: CetzStatement,
	change: { route?: ConnectorRoute; bend?: number; label?: ConnectorLabel | null }
) {
	const c = parseConnector(source, st);
	return c ? writeParsed(source, st, c, change) : null;
}

/** the connector's end k moved: onto a named element, named in the same edit when it has none, or to a point; both
 *  ends on one element is a loop, and a loop pulled off it is a line again */
export function attachConnectorEnd(source: string, pictureIndex: number, i: number, k: 0 | 1, to: Endpoint) {
	let text = source;
	let end: ConnectorEnd = { node: null, anchor: null, text: 'ref' in to ? '' : writePair(to) };
	if ('ref' in to) {
		const target = readPicture(text, pictureIndex)?.statements.find((s) => s.i === to.ref);
		if (!target) return null;
		const ensured = ensureNodeName(text, target);
		text = ensured?.source ?? text;
		end = ensured ? { node: ensured.name, anchor: to.anchor ?? null, text: '' } : { node: null, anchor: null, text: writePair(to.at) };
	}
	const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === i);
	const c = st && parseConnector(text, st);
	if (!st || !c) return null;
	const ends: [ConnectorEnd, ConnectorEnd] = k === 0 ? [end, c.ends[1]] : [c.ends[0], end];
	const self = !!ends[0].node && ends[0].node === ends[1].node;
	const loop = c.route.startsWith('loop');
	const route = self === loop ? c.route : self ? 'loop above' : 'straight';
	return writeParsed(text, st, { ...c, ends, controls: null }, { route });
}

/** every bent, looped or curved connector met at a border written again, as their ends' places are after an edit */
export function refreshConnectors(source: string, pictureIndex: number) {
	const picture = readPicture(source, pictureIndex);
	if (!picture) return source;
	let text = source;
	for (const st of [...picture.statements].reverse()) {
		const c = parseConnector(text, st);
		if (!c || c.route === 'straight' || c.route === 'hv' || c.route === 'vh') continue;
		text = writeParsed(text, st, c, {}) ?? text;
	}
	return text;
}

/** the connector's text with its ends replaced, its route through them written again; null for what is no connector */
export function connectorWithEnds(source: string, st: CetzStatement, ends: (end: ConnectorEnd) => ConnectorEnd) {
	const c = parseConnector(source, st);
	if (!c) return null;
	const next = writeParsed(source, st, { ...c, ends: [ends(c.ends[0]), ends(c.ends[1])] }, {});
	return next && next.slice(st.from, next.length - (source.length - st.to));
}
