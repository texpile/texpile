import { canvasPoint, sourceDelta, sourcePoint, type Point } from '../../figure/geometry';
import { BP_PER_CM } from '../../figure/lengthUnits';
import { snapTo } from '../../figure/numbers';
import { subtree } from '../../objects/statementTree';
import type { FigureEditorState } from '../editorState.svelte';
import { SNAP_STEP, unionBox } from '../snapTargets';
import type { StatementBox } from '../snapTargets.types';
import { chosen, editEach, outermost, selectionText } from './selectionCommands';

// what was copied last, with where it was drawn, so a paste of it can go under the pointer
let copied: { text: string; box: StatementBox | null; pastes: number } | null = null;

/** where the statements are drawn; before TeX has drawn them, the box of their points and circles as written */
function copiedBox(ed: FigureEditorState, inside: Set<number>): StatementBox | null {
	if (ed.drawingMatchesText) return unionBox(ed.snapBoxes.filter((b) => inside.has(b.stmt)));
	const corners = [...inside].flatMap((i) => {
		const st = ed.tree.byId.get(i);
		if (!st) return [];
		const m = ed.render.transformOf(i);
		const points = ed.language.pathPoints(ed.source, st).map((p): Point => [p.x, p.y]);
		const rims = ed.language.radii(ed.source, st).flatMap(({ center: c, value: r }): Point[] => [
			[c.x - r, c.y - r],
			[c.x + r, c.y + r]
		]);
		return [...points, ...rims].map(([u, v]) => ({ stmt: i, ...pointBox(canvasPoint(u, v, m)) }));
	});
	return unionBox(corners);
}

function pointBox([x, y]: Point) {
	return { x1: x, y1: y, x2: x, y2: y };
}

/** the selection's text for the clipboard */
export function copySelectionText(ed: FigureEditorState) {
	const text = selectionText(ed);
	const inside = new Set(chosen(ed).flatMap((s) => subtree(ed.tree, s.i)));
	copied = text ? { text, box: copiedBox(ed, inside), pastes: 0 } : null;
	return text;
}

const TEX_SPECIAL: Record<string, string> = { '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };

function escapeText(ed: FigureEditorState, text: string) {
	const line = text.replace(/\s+/g, ' ').trim();
	// a formula or a macro is LaTeX already, when it is whole
	if (/[\\$]/.test(line) && !ed.language.textProblem(line)) return line;
	return line.replace(/[\\~^&%#_{}$]/g, (c) => TEX_SPECIAL[c] ?? `\\${c}`);
}

/** text that is not TikZ: a node with it, under the pointer or in the middle of the view */
function pastePlainText(ed: FigureEditorState, text: string, pointer: Point | null) {
	const at = pointer ?? [ed.viewport.cx, ed.viewport.cy];
	const [u, v] = sourcePoint(...at, ed.placement);
	const next = ed.language.addShape(ed.source, ed.shownIndex, {
		tool: 'text',
		at: [snapTo(u, SNAP_STEP.fine), snapTo(v, SNAP_STEP.fine)],
		text: escapeText(ed, text)
	});
	if (next && ed.picture) ed.applyEdit(next, ed.picture.statements.length + 1);
}

/**
 * pasted statements go last and become the selection: what was copied here lands under the pointer, as Excalidraw's
 * paste does, and otherwise each paste half a grid step further on than the one before
 */
export function pasteText(ed: FigureEditorState, text: string, pointer: Point | null) {
	if (!text.trim()) return;
	if (!/;/.test(text)) {
		pastePlainText(ed, text, pointer);
		return;
	}
	const before = ed.picture?.statements.length ?? 0;
	const appended = ed.language.appendStatements(ed.source, ed.shownIndex, text);
	const picture = appended === null ? null : ed.language.readPicture(appended, ed.shownIndex);
	if (!appended || !picture) return;
	const added = outermost(picture.statements.filter((s) => s.i > before));
	const known = copied?.text === text ? copied : null;
	const pastes = known ? ++known.pastes : 1;
	const box = known?.box;
	const by: Point = pointer && box ? [pointer[0] - (box.x1 + box.x2) / 2, pointer[1] - (box.y1 + box.y2) / 2] : [0, 0];
	const [du, dv] = pointer && box ? sourceDelta(...by, ed.placement).map((d) => snapTo(d, SNAP_STEP.fine)) : [0.5 * pastes, -0.5 * pastes];
	const next = editEach(appended, added, (t, st) =>
		ed.language.describe(t, st).movable ? ed.language.shiftStatement(t, st, du, dv, [by[0] / BP_PER_CM, by[1] / BP_PER_CM]) : null
	);
	ed.applyEdit(
		next,
		added.map((s) => s.i)
	);
}
