import { absolutePoints, shiftPoints } from '../coordinates';
import { listPictures, nestedStatements, readPicture, type Picture, type Statement } from '../picture';
import { loopMovable, shiftLoop } from './loopShift';
import { namedPoints, writtenPoints } from './namedPoints';
import { shiftByOption } from './optionShift';
import { ownDelta } from './ownTransform';
import { placementMovable, readPlacement, shiftNodeByOption, shiftPlacement } from './placement';

// the picture each statement of the last text read is in; describing every statement must not parse it each time
let read: { source: string; pictures: (Picture | null)[] } = { source: '', pictures: [] };

function pictureAt(source: string, pos: number) {
	if (read.source !== source) read = { source, pictures: [] };
	const k = listPictures(source).findIndex((p) => p.from <= pos && pos < p.to);
	if (k < 0) return null;
	if (read.pictures[k] === undefined) read.pictures[k] = readPicture(source, k);
	return read.pictures[k];
}

/**
 * How the canvas moves a statement: by its points, its place beside a node, the loop it is, the coordinates it is
 * drawn through (with its own points), or a `shift` first in its options when its place is written otherwise (a
 * name, a macro). A path through a node is not moved: the node would stay
 */
export function moveWay(source: string, st: Statement): 'points' | 'placed' | 'loop' | 'named' | 'option' | null {
	if (st.kind === 'foreach') return loopMovable(source, st) ? 'loop' : null;
	const plain = absolutePoints(source, st).length > 0;
	if (st.kind === 'node') return readPlacement(source, st) && placementMovable(source, st) ? 'placed' : plain ? 'points' : 'option';
	if (st.kind === 'axis' || st.kind === 'plot') return plain ? 'points' : null;
	if (st.kind !== 'path') return null;
	const written = writtenPoints(source, st);
	if (!written.names.length) return written.other ? 'option' : plain ? 'points' : null;
	const picture = pictureAt(source, st.from);
	if (!written.other && picture && namedPoints(source, picture, st).movable) return 'named';
	return plain ? 'points' : null;
}

/** what the canvas can move; a scope when everything in it can */
export function statementMovable(source: string, st: Statement) {
	if (st.kind !== 'scope') return !!moveWay(source, st);
	const inside = nestedStatements(st).filter((s) => s.kind !== 'scope');
	return inside.length > 0 && inside.every((s) => moveWay(source, s));
}

/**
 * The statement moved by (du, dv) in the coordinates it starts in, which is `page` cm on the page: a node's shifts and
 * distances are counted there, whatever the picture's scale; a path's points take the move through its own turns and
 * scales. The coordinates it is drawn through move apart
 */
export function shiftStatement(source: string, st: Statement, du: number, dv: number, page: [number, number] = [du, dv]): string {
	if (st.kind === 'scope')
		return nestedStatements(st)
			.filter((s) => s.kind !== 'scope')
			.sort((a, b) => b.from - a.from)
			.reduce((text, s) => shiftStatement(text, s, du, dv, page), source);
	const way = moveWay(source, st);
	if (way === 'placed') return shiftPlacement(source, st, ...page);
	if (way === 'loop') return shiftLoop(source, st, du, dv, page);
	if (way === 'option') return st.kind === 'node' ? shiftNodeByOption(source, st, ...page) : shiftByOption(source, st, du, dv);
	return shiftPoints(source, absolutePoints(source, st), ...ownDelta(source, st, du, dv));
}
