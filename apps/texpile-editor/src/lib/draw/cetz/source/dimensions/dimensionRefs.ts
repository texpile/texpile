import type { PointRef } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writtenPoints } from '../coordinates';
import { readElementRef } from '../nodes/nodeAnchors';
import { ensureNodeName, nodeName } from '../nodes/nodeNames';
import type { CetzPicture, CetzStatement } from '../picture';

// a closed line's vertex is found again by the way round it to there, as written to this many places
const SAME_PERCENT = 0.01;

/** each vertex's way round a line, as a percentage, from its first point */
function vertexPercents(source: string, st: CetzStatement) {
	const points = writtenPoints(source, st);
	const closed = st.args.some((a) => a.name === 'close' && source.slice(a.value.from, a.value.to) === 'true');
	const legs = points.slice(1).map((p, k) => Math.hypot(p.x - points[k].x, p.y - points[k].y));
	if (closed && points.length > 1) legs.push(Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y));
	const total = legs.reduce((a, b) => a + b, 0) || 1;
	let run = 0;
	return points.map((_, k) => {
		const at = run;
		run += legs[k] ?? 0;
		return Number(formatNumber((100 * at) / total));
	});
}

/** the anchor point k of a statement is met by on its element, as CeTZ names it; null for a point it has no anchor at */
function anchorOf(source: string, st: CetzStatement, k: number): string | null {
	if (st.kind === 'node') return k === 0 ? '' : null;
	const points = writtenPoints(source, st);
	const p = points[k];
	if (!p || p.aside) return null;
	const last = points.length - 1;
	switch (st.command) {
		case 'circle':
			return k === 0 ? 'center' : null;
		case 'arc':
			return k === 0 ? 'arc-start' : null;
		case 'rect': {
			const q = points[1 - k];
			return q ? `${p.y < q.y ? 'south' : 'north'}-${p.x < q.x ? 'west' : 'east'}` : null;
		}
		case 'line': {
			const closed = st.args.some((a) => a.name === 'close');
			if (!closed && k === 0) return 'start';
			if (!closed && k === last) return 'end';
			return `${formatNumber(vertexPercents(source, st)[k])}%`;
		}
		case 'bezier':
			return k === 0 ? 'start' : k === 1 ? 'end' : null;
		case 'catmull':
		case 'hobby':
			return k === 0 ? 'start' : k === last ? 'end' : null;
	}
	return null;
}

/** a point of the statement as a dimension refers to it, its element named in the same edit when it has no name */
export function namePoint(source: string, st: CetzStatement, k: number) {
	if (anchorOf(source, st, k) === null) return null;
	const named = ensureNodeName(source, st);
	if (!named) return null;
	const anchor = anchorOf(source, st, k)!;
	return { source: named.source, ref: `"${named.name}${anchor ? `.${anchor}` : ''}"` };
}

function elementOf(source: string, picture: CetzPicture, name: string) {
	return picture.statements.find((s) => s.kind !== 'scope' && nodeName(source, s) === name) ?? null;
}

/** the statement's point a dimension's quoted end is at */
export function readPointRef(source: string, picture: CetzPicture, text: string): PointRef | null {
	const ref = readElementRef(text.trim());
	const st = ref && elementOf(source, picture, ref.name);
	if (!st || !ref) return null;
	const anchor = /^"[^".]+(?:\.(.+))?"$/.exec(text.trim())?.[1] ?? '';
	if (st.kind === 'node') return anchor ? null : { stmt: st.i, k: 0 };
	const points = writtenPoints(source, st);
	if (anchor.endsWith('%')) {
		const k = vertexPercents(source, st).findIndex((p) => Math.abs(p - Number(anchor.slice(0, -1))) < SAME_PERCENT);
		return k < 0 ? null : { stmt: st.i, k };
	}
	const k = points.findIndex((_, n) => anchorOf(source, st, n) === anchor);
	return k < 0 ? null : { stmt: st.i, k };
}
