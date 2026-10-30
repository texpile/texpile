import type { FigureStatement, PointSpan } from '../../figure/figureLanguage';
import { canvasPoint, sourcePoint, type Point, type SourceTransform } from '../../figure/geometry';
import type { FigureEditorState as Editor } from '../editorState.svelte';

// two ends drawn this close, in bp, are one junction
const JOIN_BP = 0.5;

/** another statement's point drawn where a moved one is, `at` on the canvas */
export type JoinedEnd = { i: number; points: PointSpan[]; k: number; m: SourceTransform; at: Point };
type PointMove = { points: PointSpan[]; k: number; m: SourceTransform; to: Point };

/** a statement that only joins others: a plain path or circuitikz's `short` */
function isWire(ed: Editor, source: string, st: FigureStatement) {
	return st.kind === 'path' && ed.language.readCircuit(source, st).every((p) => p.type === 'short');
}

/** in a circuit, the points of statements other than `owners` drawn at one of `at`; `wiresOnly` leaves parts where they are */
export function joinedEnds(ed: Editor, owners: number[], at: Point[], wiresOnly = false): JoinedEnd[] {
	if (!ed.picture?.circuit || !at.length) return [];
	const { lockedAll } = ed.flags;
	return ed.picture.statements.flatMap((st) => {
		if (owners.includes(st.i) || lockedAll.has(st.i) || (st.kind !== 'path' && st.kind !== 'node')) return [];
		if (wiresOnly && !isWire(ed, ed.source, st)) return [];
		const m = ed.render.transformOf(st.i);
		const points = ed.language.pathPoints(ed.source, st);
		return points.flatMap((p, k) => {
			const c = canvasPoint(p.x, p.y, m);
			const meets = !p.relative && at.some((a) => Math.hypot(a[0] - c[0], a[1] - c[1]) < JOIN_BP);
			return meets ? [{ i: st.i, points, k, m, at: c }] : [];
		});
	});
}

/** points moved in one edit, each to a place on the canvas; the last written first, so the spans before it stay put */
export function withPointsMoved(ed: Editor, source: string, moves: PointMove[]) {
	return [...moves]
		.sort((a, b) => b.points[b.k].from - a.points[a.k].from)
		.reduce((text, mv) => ed.language.movePoint(text, mv.points, mv.k, sourcePoint(...mv.to, mv.m)), source);
}

/** the joined points moved by `by` on the canvas, after the statements they meet were moved into `text` */
export function withJoinedCarried(ed: Editor, text: string, joined: JoinedEnd[], by: Point) {
	const picture = joined.length ? ed.language.readPicture(text, ed.shownIndex) : null;
	if (!picture) return text;
	const moves = joined.flatMap((j): PointMove[] => {
		const st = picture.statements.find((s) => s.i === j.i);
		const points = st ? ed.language.pathPoints(text, st) : [];
		return points[j.k] ? [{ points, k: j.k, m: j.m, to: [j.at[0] + by[0], j.at[1] + by[1]] }] : [];
	});
	return withPointsMoved(ed, text, moves);
}

/** the wires that meet the moving statements, which stretch to stay on them */
export function carriedWires(ed: Editor, moving: FigureStatement[]) {
	const ends = moving.flatMap((s) => {
		const m = ed.render.transformOf(s.i);
		return ed.language
			.pathPoints(ed.source, s)
			.filter((p) => !p.relative)
			.map((p) => canvasPoint(p.x, p.y, m));
	});
	return joinedEnds(
		ed,
		moving.map((s) => s.i),
		ends,
		true
	);
}
