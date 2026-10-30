import type { NodePlacement, PlaceDirection } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { nodeTextSpan } from '../nodes';
import { nodeOptionLists, readCommandOptions, writeCommandOptions } from '../options/optionList';
import type { Statement } from '../picture';
import { CM_PER_UNIT } from '$lib/draw/editor/figure/lengthUnits';

// which way each side shifts the node: right is +x, above +y
const SIDES: Record<PlaceDirection, [number, number]> = {
	above: [0, 1],
	below: [0, -1],
	left: [-1, 0],
	right: [1, 0],
	'above left': [-1, 1],
	'above right': [1, 1],
	'below left': [-1, -1],
	'below right': [1, -1]
};
const PLACED = /^(above left|above right|below left|below right|above|below|left|right)\s*=\s*(?:(.+?)\s+)?of\s+(.+)$/;
// a bare number counts in the picture's x and y units, a length in cm as the units are written
const CM_PER: Record<string, number> = { '': 1, ...CM_PER_UNIT };
const LENGTH = /^(-?\d*\.?\d+)\s*(cm|mm|pt|bp|in|em|ex)?$/;
// the em of Computer Modern at the class's size, in pt
const EM_PT: Record<string, number> = { '10': 10, '11': 10.95, '12': 11.74 };

// one distance for a corner side moves the node that far along the diagonal
const DIAGONAL = 0.707106781;

/** cm per unit; an em and an ex are the document's own, at the size its class sets */
function unitsOf(source: string): Record<string, number> {
	const size = /\\documentclass\s*\[[^\]]*?\b(1[012])pt/.exec(source)?.[1] ?? '10';
	const em = EM_PT[size] * CM_PER.pt;
	return { ...CM_PER, em, ex: em * 0.43 };
}

type Length = { value: number; unit: string };

function readLength(text: string): Length | null {
	const m = LENGTH.exec(text.trim());
	return m ? { value: Number(m[1]), unit: m[2] ?? '' } : null;
}

function replaced(items: string[], k: number, item: string) {
	return items.map((x, j) => (j === k ? item : x));
}
function writeLength(l: Length) {
	return `${formatNumber(l.value)}${l.unit}`;
}
function plus(l: Length, cm: number, units = CM_PER): Length {
	return { ...l, value: l.value + cm / units[l.unit] };
}

/** the node distance in force for the node: the last one set up to its own options, else the library's */
function nodeDistance(source: string, at: number) {
	const set = [...source.slice(0, at).matchAll(/node distance\s*=\s*([^,\]}]+)/g)].at(-1);
	return set?.[1].trim() ?? '1cm and 1cm';
}

/** a node's own `scale`, which its distance from another node is scaled by */
function nodeScale(source: string, st: Statement) {
	const scales = nodeOptionLists(source, st).flatMap((o) => o.items.flatMap((i) => /^scale\s*=\s*(-?\d*\.?\d+)$/.exec(i)?.[1] ?? []));
	return scales.reduce((k, s) => k * Number(s), 1) || 1;
}

/** the vertical and horizontal distances a placement shifts by */
function distances(text: string, direction: PlaceDirection): [Length, Length] | null {
	const [v, h] = text.includes(' and ') ? text.split(/\s+and\s+/).map(readLength) : [readLength(text), readLength(text)];
	if (!v || !h) return null;
	const [mx, my] = SIDES[direction];
	if (text.includes(' and ') || !mx || !my) return [v, h];
	return [
		{ ...v, value: v.value * DIAGONAL },
		{ ...h, value: h.value * DIAGONAL }
	];
}

function placedItem(source: string, st: Statement) {
	const options = st.kind === 'node' ? nodeOptionLists(source, st).find((o) => o.items.some((i) => PLACED.test(i))) : null;
	const k = options?.items.findIndex((i) => PLACED.test(i)) ?? -1;
	if (!options || k < 0) return null;
	const [, direction, distance, of] = PLACED.exec(options.items[k])!;
	return { options, k, placement: { direction: direction as PlaceDirection, distance: distance ?? '', of: of.trim() } };
}

export function readPlacement(source: string, st: Statement): NodePlacement | null {
	return placedItem(source, st)?.placement ?? null;
}

/** placed beside a node, at a distance the canvas can move it by */
export function placementMovable(source: string, st: Statement) {
	const found = placedItem(source, st);
	if (!found) return false;
	const { direction, distance } = found.placement;
	return !!distances(distance || nodeDistance(source, found.options.span!.to), direction);
}

function shifted(items: string[], key: 'xshift' | 'yshift', cm: number, units: Record<string, number>) {
	// a drift too small to write is none
	if (formatNumber(cm) === '0') return items;
	const k = items.findIndex((i) => new RegExp(`^${key}\\s*=`).test(i));
	const now = k < 0 ? null : readLength(items[k].replace(/^[^=]*=/, ''));
	if (k >= 0 && !now) return items;
	// a bare shift is in pt
	const next = now ? plus({ ...now, unit: now.unit || 'pt' }, cm, units) : { value: cm, unit: 'cm' };
	const item = formatNumber(next.value) === '0' ? null : `${key}=${writeLength(next)}`;
	// first, so the node's own transforms do not reach it
	if (k < 0) return [item!, ...items];
	return item ? items.map((x, j) => (j === k ? item : x)) : items.filter((_, j) => j !== k);
}

/** a node at a place written otherwise (a name, a macro) moved by (du, dv) cm on the page */
export function shiftNodeByOption(source: string, st: Statement, du: number, dv: number) {
	const options = readCommandOptions(source, st);
	if (!options) return source;
	const units = unitsOf(source);
	return writeCommandOptions(source, options, shifted(shifted(options.items, 'yshift', dv, units), 'xshift', du, units));
}

/** the node moved by (du, dv) cm on the page, which a node's distances are counted in whatever the picture's scale:
 *  further from or nearer to its node along its side, and shifted across it */
export function shiftPlacement(source: string, st: Statement, du: number, dv: number) {
	const found = placedItem(source, st);
	if (!found) return source;
	const { direction, distance, of } = found.placement;
	const both = distances(distance || nodeDistance(source, found.options.span!.to), direction);
	if (!both) return source;
	const [mx, my] = SIDES[direction];
	const units = unitsOf(source);
	const scale = nodeScale(source, st);
	const v = my ? plus(both[0], (my * dv) / scale, units) : both[0];
	const h = mx ? plus(both[1], (mx * du) / scale, units) : both[1];
	const written = mx && my ? `${writeLength(v)} and ${writeLength(h)}` : writeLength(mx ? h : v);
	let items = replaced(found.options.items, found.k, `${direction}=${written} of ${of}`);
	if (!mx) items = shifted(items, 'xshift', du, units);
	if (!my) items = shifted(items, 'yshift', dv, units);
	return writeCommandOptions(source, found.options, items);
}

/** placed beside another node, or freed to a point, its middle there in its own coordinates */
export function writePlacement(source: string, st: Statement, to: NodePlacement | { at: [number, number] }) {
	const found = placedItem(source, st);
	if (!found) return null;
	if ('direction' in to) {
		const distance = to.distance.trim() ? `${to.distance.trim()} ` : '';
		return writeCommandOptions(source, found.options, replaced(found.options.items, found.k, `${to.direction}=${distance}of ${to.of}`));
	}
	const text = nodeTextSpan(st);
	if (!text) return null;
	const at = `at (${formatNumber(to.at[0])},${formatNumber(to.at[1])}) `;
	const brace = text.from - 1;
	const freed = source.slice(0, brace) + at + source.slice(brace);
	const items = found.options.items.filter((i, j) => j !== found.k && !/^[xy]shift\s*=/.test(i));
	return writeCommandOptions(freed, found.options, items);
}
