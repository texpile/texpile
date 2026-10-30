import { absolutePoints, readVector } from '../coordinates';
import type { Picture, Statement } from '../picture';
import type { SyntaxPart } from '../reader/syntaxParts';

const NAMED = /^\(\s*([A-Za-z][\w-]*)(?:\.[^)]*)?\s*\)$/;
const WITHIN = /\(\s*([A-Za-z][\w-]*)(?:\.[^)]*)?\s*\)/g;
const COORDINATE = /^\\coordinate\s*(?:\[[^\]]*\]\s*)?\(\s*([A-Za-z][\w-]*)\s*\)/;

/** how a path's points are written: in numbers, by name, or otherwise (a macro, a computation) */
export function writtenPoints(source: string, st: Statement) {
	const out = { plain: 0, names: [] as string[], other: 0 };
	// a coordinate's or a matrix's first parentheses are its own name
	let own = st.command === '\\coordinate' || st.command === '\\matrix';
	// a circle's or ellipse's size in parentheses is not a point
	let size = false;
	function walk(parts: SyntaxPart[]) {
		for (const c of parts) {
			// a node on the path is placed by it, never what it goes through
			if (c.type === 'placement' || c.type === 'options') {
				size = false;
				continue;
			}
			if (c.type === 'keyword' && /^(circle|ellipse)$/.test(source.slice(c.from, c.to))) size = true;
			if (c.type !== 'point') {
				walk(c.parts);
				continue;
			}
			const text = source.slice(c.from, c.to);
			// a name shifted in place, `([xshift=1em]a.north)`, or computed from names, `($(a)!0.5!(b)$)`, goes where they go
			const inner = text.slice(1, -1).replace(/^\s*\[[^\]]*\]\s*/, '');
			const within = [...inner.matchAll(WITHIN)].map((m) => m[1]);
			if (own || size) [own, size] = [false, false];
			else if (readVector(text.slice(1, -1))) out.plain++;
			else if (NAMED.test(`(${inner})`)) out.names.push(NAMED.exec(`(${inner})`)![1]);
			else if (within.length) out.names.push(...within);
			// a point has a comma or a colon; without, it is a name, spelt with a macro: `(\\from)`, `(i\\y)`, `(0)`
			else if (!/[,:$]/.test(inner)) out.names.push(inner.trim());
			else out.other++;
		}
	}
	if (st.kind === 'path') walk(st.parts);
	return out;
}

/**
 * The `\coordinate`s a path is drawn through by name, each the last set before it; a move takes them along when
 * every name is one, set at a point of its own, so nothing else it meets (a node) is left behind
 */
export function namedPoints(source: string, picture: Picture, st: Statement) {
	const names = writtenPoints(source, st).names;
	function setBefore(name: string) {
		return picture.statements.filter((s) => s.from < st.from && COORDINATE.exec(source.slice(s.from, s.to))?.[1] === name).at(-1);
	}
	const sets = names.map(setBefore);
	const found = [...new Set(sets.filter((s) => !!s))] as Statement[];
	const movable = names.length > 0 && sets.every((s) => s && absolutePoints(source, s).length > 0);
	return { points: found, movable };
}
