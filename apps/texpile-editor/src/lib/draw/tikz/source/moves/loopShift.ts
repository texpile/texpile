import { unnumbered, type Statement } from '../picture';
import { writtenPoints } from './namedPoints';
import { shiftByOption, stretchByOption } from './optionShift';
import { shiftNodeByOption } from './placement';

/** what a `\foreach` draws each time round, a nested loop's body included */
function loopBody(st: Statement): Statement[] {
	return st.body.map((s) => unnumbered(s, false));
}

function drawn(source: string, st: Statement): Statement[] | null {
	const body = loopBody(st);
	// a path through names (`(\\from) -- (\\to)`) is drawn where they are, whatever its shift
	const each = body.map((s) =>
		s.kind === 'foreach'
			? drawn(source, s)
			: s.kind === 'node' || (s.kind === 'path' && !writtenPoints(source, s).names.length)
				? [s]
				: null
	);
	return body.length && each.every((s) => s !== null) ? (each.flat() as Statement[]) : null;
}

/** a loop the canvas moves: everything in it is a path or a node */
export function loopMovable(source: string, st: Statement) {
	return st.kind === 'foreach' && !!drawn(source, st)?.length;
}

/** each thing the loop draws shifted first, before its own transforms: a path by (du, dv), a node by `page` cm */
export function shiftLoop(source: string, st: Statement, du: number, dv: number, page: [number, number]) {
	return [...(drawn(source, st) ?? [])]
		.sort((a, b) => b.from - a.from)
		.reduce((text, s) => (s.kind === 'node' ? shiftNodeByOption(text, s, ...page) : shiftByOption(text, s, du, dv)), source);
}

/** each thing the loop draws stretched about `anchor`, by a scale first in its options, as a plot of a function is */
export function stretchLoop(source: string, st: Statement, anchor: readonly [number, number], sx: number, sy: number) {
	return [...(drawn(source, st) ?? [])]
		.sort((a, b) => b.from - a.from)
		.reduce((text, s) => stretchByOption(text, s, anchor, sx, sy), source);
}
