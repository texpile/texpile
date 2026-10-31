import type { Endpoint, LetGoReference } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writtenPoints, radii, writePair } from './coordinates';
import { connectorWithEnds } from './connectors/connectorWrite';
import { writePlacement } from './moves/placement';
import { readElementRef, writeElementRef } from './nodes/nodeAnchors';
import { outlinePoints } from './nodes/nodeOutline';
import { ensureNodeName, nodeName, nameArg } from './nodes/nodeNames';
import { contentTextSpan } from './nodes/nodeText';
import { readPicture, type CetzStatement } from './picture';
import { arcStretchEdits } from './shapes/arcs';
import { typedText, typstText } from './typstText';

// a line's ends and the points between are its positional arguments, which a name in quotes can be
const ENDED = new Set(['line', 'bezier', 'bezier-through', 'catmull', 'hobby']);

/** every point scaled away from `anchor`, radii with them; a circle takes sx for its radius */
export function stretchStatement(source: string, st: CetzStatement, [ax, ay]: Point, sx: number, sy: number) {
	const edits = [
		...writtenPoints(source, st).map((p) => ({ ...p, text: writePair([ax + (p.x - ax) * sx, ay + (p.y - ay) * sy]) })),
		...radii(source, st).map((r) => ({ ...r, text: formatNumber(Math.abs(r.value * (r.axis === 'y' ? sy : sx))) })),
		...arcStretchEdits(source, st, sx, sy)
	].sort((a, b) => b.from - a.from);
	return edits.reduce((out, e) => out.slice(0, e.from) + e.text + out.slice(e.to), source);
}

/** the argument end k of a line is written as */
function endArg(st: CetzStatement, k: 0 | 1, source: string) {
	if (!ENDED.has(st.command)) return null;
	const positional = st.args.filter((a) => !a.name && source[a.value.from] !== '{' && source[a.value.from] !== '[');
	return (k === 0 ? positional[0] : positional.at(-1)) ?? null;
}

/** end k of a line moved: onto a named element (named in the same edit when it has no name yet), or to a point */
export function attachEnd(source: string, pictureIndex: number, i: number, k: 0 | 1, to: Endpoint) {
	let text = source;
	let written = 'ref' in to ? '' : writePair(to as Point);
	if ('ref' in to) {
		const target = readPicture(text, pictureIndex)?.statements.find((s) => s.i === to.ref);
		if (!target) return null;
		// inside a group it cannot be pointed at, and the end stays where it is let go
		const ensured = ensureNodeName(text, target);
		written = ensured ? writeElementRef(ensured.name, to.anchor, { source: text, st: target }) : writePair(to.at);
		text = ensured?.source ?? text;
	}
	const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === i);
	const arg = st && endArg(st, k, text);
	return arg ? text.slice(0, arg.value.from) + written + text.slice(arg.value.to) : null;
}

/** what `gone` gives a name to, let go of: each point another statement takes from it written where `pointOf` says */
export function letGoOf(
	source: string,
	pictureIndex: number,
	gone: number[],
	pointOf: (st: CetzStatement, ref: LetGoReference) => Point | null,
	placeOf: (st: CetzStatement) => Point | null
) {
	const picture = readPicture(source, pictureIndex);
	if (!picture) return source;
	const owners = new Map<string, CetzStatement>();
	for (const st of picture.statements) {
		const name = gone.includes(st.i) ? nodeName(source, st) : null;
		if (name) owners.set(name, st);
	}
	function pointFor(st: CetzStatement, text: string) {
		const name = readElementRef(text)?.name;
		const owner = name ? owners.get(name) : null;
		const ref = owner && readElementRef(text, { source, st: owner });
		return owner && ref ? pointOf(st, { stmt: owner.i, ...ref }) : null;
	}
	const edits: { from: number; to: number; text: string }[] = [];
	for (const st of picture.statements.filter((s) => !gone.includes(s.i))) {
		// a connector's route goes through its ends too, so it is written again from where they are let go to
		const connector = connectorWithEnds(source, st, (e) => {
			const at = e.node ? pointFor(st, e.text) : null;
			return at ? { node: null, anchor: null, text: writePair(at) } : e;
		});
		if (connector !== null) {
			if (connector !== source.slice(st.from, st.to)) edits.push({ from: st.from, to: st.to, text: connector });
			continue;
		}
		// a node placed beside one that goes stays where it is
		const beside = st.kind === 'node' ? outlinePoints(source, st)?.to : null;
		const place = beside && owners.has(readElementRef(beside)?.name ?? '') ? placeOf(st) : null;
		const freed = place && writePlacement(source, st, { at: [place[0], place[1]] });
		if (freed) {
			edits.push({ from: st.from, to: st.to, text: freed.slice(st.from, freed.length - (source.length - st.to)) });
			continue;
		}
		// what a group holds is let go of statement by statement
		if (st.kind === 'scope') continue;
		// a name may be written inside another coordinate, `(rel: (1, 0), to: "a.east")`; a state's own name is no
		// reference to another
		for (const a of st.args.filter((x) => !x.name && x !== nameArg(st)))
			for (const m of source.slice(a.value.from, a.value.to).matchAll(/"[^"]*"/g)) {
				const at = pointFor(st, m[0]);
				const from = a.value.from + m.index!;
				if (at) edits.push({ from, to: from + m[0].length, text: writePair(at) });
			}
	}
	return edits.sort((a, b) => b.from - a.from).reduce((out, e) => out.slice(0, e.from) + e.text + out.slice(e.to), source);
}

/** a content element's text, as the lines Typst's `\` breaks it into */
export function readContentLines(source: string, st: CetzStatement) {
	const span = contentTextSpan(source, st);
	return span
		? source
				.slice(span.from, span.to)
				.split(/\s*\\\s+/)
				.map(typedText)
		: null;
}

export function writeContentLines(source: string, st: CetzStatement, lines: string[]) {
	const span = contentTextSpan(source, st);
	return span ? source.slice(0, span.from) + lines.map(typstText).join(' \\ ') + source.slice(span.to) : null;
}
