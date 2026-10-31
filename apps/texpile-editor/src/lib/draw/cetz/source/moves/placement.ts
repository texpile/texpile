import type { NodePlacement, PlaceDirection } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { CM_PER_UNIT } from '$lib/draw/editor/figure/lengthUnits';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writePair } from '../coordinates';
import { COMPASS, readElementRef, writeElementRef } from '../nodes/nodeAnchors';
import { nodeName } from '../nodes/nodeNames';
import { outlineOf, outlinePoints } from '../nodes/nodeOutline';
import { holdsText, namedArg, pictureAround, type CetzPicture, type CetzStatement } from '../picture';

// each side, as the anchor of the other node it is measured from
const ANCHOR_OF: Record<PlaceDirection, string> = {
	above: 'north',
	below: 'south',
	left: 'west',
	right: 'east',
	'above left': 'north west',
	'above right': 'north east',
	'below left': 'south west',
	'below right': 'south east'
};
const OPPOSITE: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
// one distance for a corner side moves the node that far along the diagonal, as TikZ's positioning does
const DIAGONAL = 0.707106781;

function opposite(anchor: string) {
	return anchor
		.split(' ')
		.map((w) => OPPOSITE[w])
		.join(' ');
}

/** which way the side is, the diagonal's a step along it */
function stepOf(direction: PlaceDirection): Point {
	const [dx, dy] = COMPASS[ANCHOR_OF[direction]];
	return dx && dy ? [dx * DIAGONAL, dy * DIAGONAL] : [dx, dy];
}

function elementNamed(source: string, picture: CetzPicture, name: string) {
	return picture.statements.find((s) => (s.kind === 'node' || s.kind === 'path') && nodeName(source, s) === name) ?? null;
}

/** the node's box where it is, an anchor it is placed from found in turn; null for one placed otherwise */
export function elementBox(
	source: string,
	picture: CetzPicture,
	st: CetzStatement,
	depth = 0
): { center: Point; w: number; h: number } | null {
	const at = outlinePoints(source, st);
	if (!at || depth > 20) return null;
	const outline =
		st.command === 'content'
			? { center: at.points[0], w: 0, h: 0 }
			: outlineOf(st.command, at.points, namedArg(source, st, 'radius')?.text ?? null);
	if (!outline) return null;
	if (!at.to) return outline;
	const ref = readElementRef(at.to);
	const from = ref && elementNamed(source, picture, ref.name);
	const box = from && elementBox(source, picture, from, depth + 1);
	if (!box || !ref) return null;
	const [dx, dy] = ref.anchor ? (COMPASS[readElementRef(at.to, { source, st: from })!.anchor ?? ''] ?? [0, 0]) : [0, 0];
	const origin: Point = [box.center[0] + (dx * box.w) / 2, box.center[1] + (dy * box.h) / 2];
	return { ...outline, center: [origin[0] + outline.center[0], origin[1] + outline.center[1]] };
}

/** where a node placed beside another is: the side, the distance between them along it, and the other's name */
export function readPlacement(source: string, st: CetzStatement): NodePlacement | null {
	const around = pictureAround(source, st);
	const at = st.kind === 'node' ? outlinePoints(source, st) : null;
	if (!around || !at?.to) return null;
	const name = readElementRef(at.to)?.name;
	const other = name ? elementNamed(source, around.picture, name) : null;
	const anchor = other && readElementRef(at.to, { source, st: other })?.anchor;
	const direction = (Object.keys(ANCHOR_OF) as PlaceDirection[]).find((d) => ANCHOR_OF[d] === anchor);
	if (!direction || !name) return null;
	const [dx, dy] = COMPASS[anchor!];
	let near: Point;
	if (st.text || st.command === 'finite-state') {
		const box = outlineOf(st.command, at.points, namedArg(source, st, 'radius')?.text ?? null);
		if (!box) return null;
		near = [box.center[0] - (dx * box.w) / 2, box.center[1] - (dy * box.h) / 2];
	} else {
		// text alone is placed by its own anchor, the one facing the other node
		if (namedArg(source, st, 'anchor')?.text !== `"${opposite(anchor!).replaceAll(' ', '-')}"`) return null;
		near = at.points[0];
	}
	const length = Math.hypot(dx, dy);
	const along = (near[0] * dx + near[1] * dy) / length;
	return { direction, distance: `${formatNumber(along)}cm`, of: name };
}

function cmOf(distance: string) {
	const m = /^(-?\d*\.?\d+)\s*(cm|mm|pt|bp|in)?$/.exec(distance.trim());
	return m ? Number(m[1]) * (m[2] ? CM_PER_UNIT[m[2]] : 1) : 1;
}

/** the coordinate arguments the outline or the text is placed by */
function placingArgs(st: CetzStatement) {
	const positional = st.args.filter((a) => !a.name);
	return holdsText(st.command) ? positional.slice(0, -1) : positional;
}

/** the edit setting text's own anchor, or taking it off */
function anchorEdit(st: CetzStatement, anchor: string | null) {
	const at = st.args.find((a) => a.name === 'anchor');
	const text = anchor ? `anchor: "${anchor.replaceAll(' ', '-')}"` : '';
	if (at) return anchor ? { from: at.from, to: at.to, text } : { from: st.args[st.args.indexOf(at) - 1].to, to: at.to, text };
	const end = st.args.at(-1)!.to;
	return anchor ? { from: end, to: end, text: `, ${text}` } : null;
}

/** placed beside another node, `distance` from it along the side, or freed to a point: its middle there */
export function writePlacement(source: string, st: CetzStatement, to: NodePlacement | { at: [number, number] }) {
	const around = pictureAround(source, st);
	const at = st.kind === 'node' ? outlinePoints(source, st) : null;
	if (!around || !at) return null;
	const outlined = st.text || st.command === 'finite-state';
	const box = outlined
		? outlineOf(st.command, at.points, namedArg(source, st, 'radius')?.text ?? null)
		: { center: at.points[0], w: 0, h: 0 };
	if (!box) return null;
	let points: string[];
	let anchor: string | null = null;
	if ('at' in to) {
		const by: Point = [to.at[0] - box.center[0], to.at[1] - box.center[1]];
		points = at.points.map((p) => writePair([p[0] + by[0], p[1] + by[1]]));
	} else {
		const other = elementNamed(source, around.picture, to.of);
		if (!other) return null;
		const name = ANCHOR_OF[to.direction];
		const [sx, sy] = stepOf(to.direction);
		const [dx, dy] = COMPASS[name];
		const d = to.distance ? cmOf(to.distance) : 1;
		// the side of this node facing the other one is that far from its anchor
		const center: Point = [sx * d + (dx * box.w) / 2, sy * d + (dy * box.h) / 2];
		const moved = at.points.map((p): Point => [p[0] + center[0] - box.center[0], p[1] + center[1] - box.center[1]]);
		const ref = writeElementRef(to.of, name, { source, st: other });
		points = moved.map((p, k) =>
			k ? `(rel: ${writePair([p[0] - moved[k - 1][0], p[1] - moved[k - 1][1]])})` : `(rel: ${writePair(p)}, to: ${ref})`
		);
		anchor = outlined ? null : opposite(name);
	}
	const edits = placingArgs(st).map((a, k) => ({ ...a.value, text: points[k] }));
	const own = outlined ? null : anchorEdit(st, anchor);
	if (own) edits.push(own);
	return edits.sort((a, b) => b.from - a.from).reduce((out, e) => out.slice(0, e.from) + e.text + out.slice(e.to), source);
}
