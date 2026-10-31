import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { drawnArgs, shiftPoints, writePair, writtenPoints } from '../coordinates';
import { readElementRef } from '../nodes/nodeAnchors';
import { holdsText, pictureAround, readPicture, type CetzStatement, type CetzTurn } from '../picture';
import { closingBracket, readPair, splitArgs, type Arg } from '../syntax';

const RELATIVE = /^\(\s*rel\s*:/;

/** the arguments a statement is placed by: its positional ones but a content's text and code blocks */
function coordinateArgs(source: string, st: CetzStatement) {
	const positional = drawnArgs(source, st);
	const placed = holdsText(st.command) ? positional.slice(0, -1) : positional;
	return placed.filter((a) => source[a.value.from] !== '[' && source[a.value.from] !== '{');
}

/** a group placed by a `translate` first in it, as a plot is: the place it moves by */
function leadingShift(source: string, st: CetzStatement, statements: CetzStatement[]) {
	const first = statements.find((s) => s.i !== st.i && st.from <= s.from && s.to <= st.to);
	const at = first?.command === 'translate' && first.args.length === 1 ? first.args[0] : null;
	const p = at && readPair(source.slice(at.value.from, at.value.to));
	return p && at ? { ...at.value, x: p[0], y: p[1] } : null;
}

/** a point written some other way than as plain numbers: a name, a turn and a length, a variable, or one already
 *  placed from another, `(rel: (1, 0), to: "a")`; null for one written from the point before it */
function placedFrom(source: string, a: Arg) {
	const text = source.slice(a.value.from, a.value.to);
	if (readPair(text)) return null;
	if (!RELATIVE.test(text)) return { arg: a, rel: null };
	const parts = closingBracket(source, a.value.from) === a.value.to - 1 ? splitArgs(source, a.value.from, a.value.to - 1) : [];
	const rel = parts.find((p) => p.name === 'rel');
	const to = parts.find((p) => p.name === 'to');
	const by = rel && readPair(source.slice(rel.value.from, rel.value.to));
	return to && by ? { arg: a, rel: { by, to: source.slice(to.value.from, to.value.to) } } : null;
}

/** how the canvas moves it: by its points; a node placed by another element or written otherwise by a `rel` from
 *  where it is, as TikZ shifts it; a line through a named element only by its own points, as TikZ's stays */
export function moveWay(source: string, st: CetzStatement): 'points' | 'rel' | null {
	if (st.kind !== 'path' && st.kind !== 'node') return null;
	const plain = writtenPoints(source, st).length > 0;
	const other = coordinateArgs(source, st).filter((a) => !readPair(source.slice(a.value.from, a.value.to)));
	if (!other.length) return plain ? 'points' : null;
	const named = other.some((a) => readElementRef(source.slice(a.value.from, a.value.to)));
	if (st.kind === 'path' && named) return plain ? 'points' : null;
	// one written from the point before it goes where that point goes
	const placeable = other.every((a) => placedFrom(source, a) || RELATIVE.test(source.slice(a.value.from, a.value.to)));
	return placeable ? 'rel' : plain ? 'points' : null;
}

export function statementMovable(source: string, st: CetzStatement, statements?: CetzStatement[]): boolean {
	if (st.kind !== 'scope') return !!moveWay(source, st);
	if (leadingShift(source, st, statements ?? pictureAround(source, st)?.picture.statements ?? [])) return true;
	const inside = (statements ?? pictureAround(source, st)?.picture.statements ?? []).filter(
		(s) => s !== st && st.from <= s.from && s.to <= st.to && s.kind !== 'scope'
	);
	return inside.length > 0 && inside.every((s) => moveWay(source, s));
}

/** the points written otherwise moved by a `rel` from where they are */
function shiftPlaced(source: string, st: CetzStatement, du: number, dv: number) {
	const edits = coordinateArgs(source, st).flatMap((a) => {
		const placed = placedFrom(source, a);
		if (!placed) return [];
		const [x, y] = placed.rel ? [placed.rel.by[0] + du, placed.rel.by[1] + dv] : [du, dv];
		const to = placed.rel?.to ?? source.slice(a.value.from, a.value.to);
		const text = Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 ? to : `(rel: (${formatNumber(x)}, ${formatNumber(y)}), to: ${to})`;
		return [{ ...a.value, text }];
	});
	return edits.sort((a, b) => b.from - a.from).reduce((out, e) => out.slice(0, e.from) + e.text + out.slice(e.to), source);
}

/** a turn's point moved with what it turns, so the turn stays the same about it */
function shiftTurn(source: string, turn: CetzTurn, du: number, dv: number) {
	const origin = turn.call.args.find((a) => a.name === 'origin');
	const to = writePair([turn.origin[0] + du, turn.origin[1] + dv]);
	if (origin) return source.slice(0, origin.value.from) + to + source.slice(origin.value.to);
	const last = turn.call.args.at(-1)!;
	return `${source.slice(0, last.to)}, origin: ${to}${source.slice(last.to)}`;
}

/** moved by (du, dv): a group by what it holds, a turn with what it turns */
export function shiftStatement(source: string, st: CetzStatement, du: number, dv: number): string {
	let text: string;
	const shift = st.kind === 'scope' ? leadingShift(source, st, pictureAround(source, st)?.picture.statements ?? []) : null;
	if (shift) text = shiftPoints(source, [shift], du, dv);
	else if (st.kind === 'scope') {
		const inside = (pictureAround(source, st)?.picture.statements ?? []).filter(
			(s) => s !== st && st.from <= s.from && s.to <= st.to && s.kind !== 'scope'
		);
		text = inside.sort((a, b) => b.from - a.from).reduce((out, s) => shiftStatement(out, s, du, dv), source);
	} else {
		const way = moveWay(source, st);
		const placed = way === 'rel' ? shiftPlaced(source, st, du, dv) : source;
		const now =
			way === 'rel' ? (readPicture(placed, pictureAround(source, st)?.index ?? 0)?.statements.find((s) => s.i === st.i) ?? st) : st;
		text = shiftPoints(placed, writtenPoints(placed, now), du, dv);
	}
	// what is turned comes after its turn in the text, so the turn's place is where it was
	return st.turn ? shiftTurn(text, st.turn, du, dv) : text;
}
