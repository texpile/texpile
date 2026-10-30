import type { FigureStatement } from '../../figure/figureLanguage';
import { canvasPoint, sourceDelta, sourcePoint, type SourceTransform, type Point } from '../../figure/geometry';
import { BP_PER_CM } from '../../figure/lengthUnits';
import { subtree } from '../../objects/statementTree';
import type { FigureEditorState } from '../editorState.svelte';
import { unionBox } from '../snapTargets';
import { carriedWires, withJoinedCarried } from './joinedEnds';
import { withReferencesLetGo } from './letGoPoints';

type Editor = FigureEditorState;

export type AlignMode = 'left' | 'center' | 'right' | 'bottom' | 'middle' | 'top';

/** the statements not inside another one of them: a scope takes its children with it */
export function outermost<S extends FigureStatement>(statements: S[]) {
	return statements.filter((s) => !statements.some((o) => o !== s && o.from <= s.from && s.to <= o.to));
}

/** one edit per statement, the last in the text first, so the earlier ones keep their places */
export function editEach(source: string, statements: FigureStatement[], edit: (text: string, st: FigureStatement) => string | null) {
	let out = source;
	for (const st of [...statements].sort((a, b) => b.from - a.from)) out = edit(out, st) ?? out;
	return out;
}

export function chosen(ed: Editor) {
	return outermost(ed.selectedStatements.filter((s) => s.kind !== 'frame'));
}
function movable(ed: Editor) {
	return chosen(ed).filter((s) => ed.language.describe(ed.source, s).movable);
}

/** what is drawn and moved for a statement: itself, or what is in it when it is a scope */
function leavesOf(ed: Editor, st: FigureStatement) {
	if (st.kind !== 'scope') return [st];
	return subtree(ed.tree, st.i)
		.map((i) => ed.tree.byId.get(i)!)
		.filter((s) => s.kind !== 'scope');
}

/** the statements a move shifts: each selected one, a scope by what is in it, and the named points a path is drawn
 *  through, each once and in its own coordinates */
export function movers(ed: Editor) {
	const leaves = movable(ed).flatMap((s) => leavesOf(ed, s));
	const picture = ed.picture;
	const through = picture
		? leaves.flatMap((s) => {
				const named = ed.language.namedPoints(ed.source, picture, s);
				return named.movable ? named.points : [];
			})
		: [];
	return [...new Map([...leaves, ...through].map((s) => [s.i, s])).values()];
}

/** each statement moved by its canvas offset, written in its own coordinates */
function shifted(ed: Editor, offsets: Map<number, Point>) {
	return editEach(
		ed.source,
		movers(ed).filter((s) => offsets.has(s.i)),
		(text, st) => {
			const offset = offsets.get(st.i)!;
			const [du, dv] = sourceDelta(...offset, ed.render.outerOf(st.i));
			return du || dv ? ed.language.shiftStatement(text, st, du, dv, [offset[0] / BP_PER_CM, offset[1] / BP_PER_CM]) : null;
		}
	);
}

/** by a canvas offset in bp */
/** by one offset for all, a circuit's wires that meet them stretching to stay on them */
function carried(ed: Editor, by: Point) {
	const moving = movers(ed);
	return withJoinedCarried(ed, shifted(ed, new Map(moving.map((s) => [s.i, by]))), carriedWires(ed, moving), by);
}

export function moveSelection(ed: Editor, by: Point) {
	if (by[0] || by[1]) ed.applyIfChanged(carried(ed, by));
}

function canvasStep(ed: Editor, du: number, dv: number): Point {
	const m = ed.render.transformOf(ed.selected);
	const [ox, oy] = canvasPoint(0, 0, m);
	const [x, y] = canvasPoint(du, dv, m);
	return [x - ox, y - oy];
}

/** by a step in the selected statement's own units, as the position field gives it */
export function moveSelectionBy(ed: Editor, du: number, dv: number) {
	moveSelection(ed, canvasStep(ed, du, dv));
}

/** an arrow key's step; steps close together are one undo step */
export function nudgeSelection(ed: Editor, du: number, dv: number) {
	const by = canvasStep(ed, du, dv);
	if (by[0] || by[1]) ed.applyNudge(carried(ed, by));
}

export function deleteSelection(ed: Editor) {
	const all = chosen(ed);
	if (!all.length) return;
	const gone = new Set(all.flatMap((s) => subtree(ed.tree, s.i)));
	const text = withReferencesLetGo(ed, gone);
	const statements = ed.language.readPicture(text, ed.shownIndex)?.statements ?? [];
	const removed = outermost(statements.filter((s) => gone.has(s.i)));
	const next = editEach(text, removed, (source, st) => ed.language.removeStatement(source, st));
	const broken = ed.language.brokenNeed(ed.source, next, ed.shownIndex);
	if (broken) ed.check.decline(`Not deleted: ${broken}.`);
	else ed.applyEdit(next, 0);
}

/** copies half a grid step down and right, or `by` on the canvas in bp, which become the selection */
export function duplicateSelection(ed: Editor, by?: Point) {
	const all = movable(ed).sort((a, b) => a.from - b.from);
	if (!all.length) return;
	const next = editEach(ed.source, all, (text, st) => {
		if (!by) return ed.language.duplicateStatement(text, st, 0.5, -0.5);
		const [du, dv] = sourceDelta(...by, ed.render.outerOf(st.i));
		return ed.language.duplicateStatement(text, st, du, dv, [by[0] / BP_PER_CM, by[1] / BP_PER_CM]);
	});
	// each copy lands right after its original and what is in it, after the copies before it
	let added = 0;
	const copies = all.map((s) => {
		const size = subtree(ed.tree, s.i).length;
		added += size;
		return s.i + added;
	});
	ed.applyEdit(next, copies);
}

/** several statements scaled away from one anchor, given in the coordinates of `m` */
export function stretchStatements(
	ed: Editor,
	base: string,
	statements: FigureStatement[],
	anchor: readonly [number, number],
	m: SourceTransform,
	sx: number,
	sy: number
) {
	const at = canvasPoint(...anchor, m);
	return editEach(base, statements, (text, st) =>
		ed.language.stretchStatement(text, st, sourcePoint(...at, ed.render.transformOf(st.i)), sx, sy)
	);
}

/** each selected statement's drawn box, a scope's around all of it, with what moves when it does */
function boxesOf(ed: Editor) {
	return movable(ed).flatMap((s) => {
		const leaves = leavesOf(ed, s).map((l) => l.i);
		const box = unionBox(ed.snapBoxes.filter((b) => leaves.includes(b.stmt)));
		return box ? [{ ...box, stmt: s.i, leaves }] : [];
	});
}

function offsetsOf(boxes: ReturnType<typeof boxesOf>, offset: (b: ReturnType<typeof boxesOf>[number]) => Point) {
	return new Map<number, Point>(boxes.flatMap((b) => b.leaves.map((l): [number, Point] => [l, offset(b)])));
}

/** to the selection's own extent: its left side, its middle, and so on */
export function alignSelection(ed: Editor, how: AlignMode) {
	const boxes = boxesOf(ed);
	if (boxes.length < 2) return;
	const x1 = Math.min(...boxes.map((b) => b.x1));
	const x2 = Math.max(...boxes.map((b) => b.x2));
	const y1 = Math.min(...boxes.map((b) => b.y1));
	const y2 = Math.max(...boxes.map((b) => b.y2));
	const offsets = offsetsOf(boxes, (b) => {
		const dx = how === 'left' ? x1 - b.x1 : how === 'right' ? x2 - b.x2 : how === 'center' ? (x1 + x2 - b.x1 - b.x2) / 2 : 0;
		const dy = how === 'bottom' ? y1 - b.y1 : how === 'top' ? y2 - b.y2 : how === 'middle' ? (y1 + y2 - b.y1 - b.y2) / 2 : 0;
		return [dx, dy];
	});
	ed.applyIfChanged(shifted(ed, offsets));
}

/** equal gaps between the shapes, the outer two staying put */
export function distributeSelection(ed: Editor, axis: 'x' | 'y') {
	const boxes = boxesOf(ed);
	if (boxes.length < 3) return;
	function lo(b: (typeof boxes)[number]) {
		return axis === 'x' ? b.x1 : b.y1;
	}
	function size(b: (typeof boxes)[number]) {
		return axis === 'x' ? b.x2 - b.x1 : b.y2 - b.y1;
	}
	const sorted = [...boxes].sort((a, b) => lo(a) + size(a) / 2 - lo(b) - size(b) / 2);
	const start = lo(sorted[0]);
	const end = Math.max(...sorted.map((b) => lo(b) + size(b)));
	const gap = (end - start - sorted.reduce((sum, b) => sum + size(b), 0)) / (sorted.length - 1);
	let at = start;
	const by = new Map<number, number>();
	for (const b of sorted) {
		by.set(b.stmt, at - lo(b));
		at += size(b) + gap;
	}
	ed.applyIfChanged(
		shifted(
			ed,
			offsetsOf(boxes, (b) => (axis === 'x' ? [by.get(b.stmt)!, 0] : [0, by.get(b.stmt)!]))
		)
	);
}

/** the selected statements' text, in the order they are written */
export function selectionText(ed: Editor) {
	return chosen(ed)
		.sort((a, b) => a.from - b.from)
		.map((s) => ed.source.slice(s.from, s.to))
		.join('\n');
}
