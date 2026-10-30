import { pathPoints } from '../coordinates';
import { ensureNodeName, nodeName } from '../nodes';
import type { Statement } from '../picture';

const NAMED = /^\s*coordinate\s*\(\s*([A-Za-z][\w-]*)\s*\)/;

/** the name written after a point of a path, `coordinate (D1)`, if it has one */
export function pointName(source: string, st: Statement, k: number) {
	const p = pathPoints(source, st)[k];
	return p ? (NAMED.exec(source.slice(p.to))?.[1] ?? null) : null;
}

/** a point that stands on the path itself: not a curve's control point, a node's place or one of a plot's points */
function canBeNamed(before: string) {
	let depth = 0;
	for (const ch of before) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0;
	return depth === 0 && !/\b(controls|and|at)\s*$/.test(before);
}

/**
 * A name TikZ knows the point by: a node's own (its center), or one written after a path's point, `D1`, `D2`, ... as
 * it needs one. Null for a point that cannot carry a name, such as a plot's
 */
export function namePoint(source: string, st: Statement, k: number): { source: string; name: string } | null {
	if (st.kind === 'node') return k === 0 ? ensureNodeName(source, st) : null;
	if (st.kind !== 'path') return null;
	const p = pathPoints(source, st)[k];
	if (!p || !canBeNamed(source.slice(st.from, p.from))) return null;
	const own = pointName(source, st, k);
	if (own) return { source, name: own };
	let n = 1;
	while (new RegExp(`\\(\\s*D${n}\\s*\\)`).test(source)) n++;
	const name = `D${n}`;
	return { source: `${source.slice(0, p.to)} coordinate (${name})${source.slice(p.to)}`, name };
}

/** the point a name was given to: a path's point by its place, or a node's center */
export function findName(source: string, statements: Statement[], name: string): { stmt: number; k: number } | null {
	for (const st of statements) {
		if (st.kind === 'node' && nodeName(source, st) === name) return { stmt: st.i, k: 0 };
		if (st.kind !== 'path') continue;
		const k = pathPoints(source, st).findIndex((_, n) => pointName(source, st, n) === name);
		if (k >= 0) return { stmt: st.i, k };
	}
	return null;
}
