import { boundsOf } from '../canvas/partBounds';
import type { ClipRegion, DrawnPart } from '../drawing/drawing.types';
import type { FigureEditorState } from './editorState.svelte';
import type { Guide, StatementBox } from './snapTargets.types';

export const SNAP_STEP = { grid: 0.5, fine: 0.1 };

export function unionBox(boxes: StatementBox[]): StatementBox | null {
	if (!boxes.length) return null;
	return {
		stmt: boxes[0].stmt,
		x1: Math.min(...boxes.map((b) => b.x1)),
		y1: Math.min(...boxes.map((b) => b.y1)),
		x2: Math.max(...boxes.map((b) => b.x2)),
		y2: Math.max(...boxes.map((b) => b.y2))
	};
}

/** each statement's drawn extent, strokes left out so the lines fall on the points as written */
export function statementBoxes(parts: DrawnPart[], fontSize: (font: number) => number, clips: ClipRegion[] = []): StatementBox[] {
	const byStatement = new Map<number, DrawnPart[]>();
	for (const p of parts) if (p.stmt && !p.apart) byStatement.set(p.stmt, [...(byStatement.get(p.stmt) ?? []), p]);
	return [...byStatement].flatMap(([stmt, own]) => {
		const b = boundsOf(
			own.map((p) => (p.kind === 'path' ? { ...p, stroke: null } : p)),
			fontSize,
			clips
		);
		return b ? [{ ...b, stmt }] : [];
	});
}

/** the box line nearest one of `values` within reach, and how far to shift to sit on it */
export function nearestGuide(
	boxes: StatementBox[],
	axis: 'x' | 'y',
	values: number[],
	span: [number, number],
	reach: number,
	exclude: number[]
) {
	let best: { shift: number; guide: Guide } | null = null;
	for (const b of boxes) {
		if (exclude.includes(b.stmt)) continue;
		const [lo, hi] = axis === 'x' ? [b.x1, b.x2] : [b.y1, b.y2];
		const [from, to] = axis === 'x' ? [b.y1, b.y2] : [b.x1, b.x2];
		for (const line of [lo, (lo + hi) / 2, hi])
			for (const v of values) {
				const shift = line - v;
				if (Math.abs(shift) < reach && (!best || Math.abs(shift) < Math.abs(best.shift)))
					best = { shift, guide: { axis, at: line, from: Math.min(from, span[0]), to: Math.max(to, span[1]) } };
			}
	}
	return best;
}

/** each statement's drawn box, for the guides a drag lines up on; the canvas is one too, as statement -1 */
export function editorSnapBoxes(ed: FigureEditorState, shownParts: DrawnPart[]): StatementBox[] {
	const s = ed.sheet;
	const sheet = s?.framed ? [{ stmt: -1, x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y + s.h }] : [];
	if (!ed.drawingMatchesText) return sheet;
	return [...sheet, ...statementBoxes(shownParts, (f) => ed.render.fonts.get(f)?.size ?? 10, ed.render.drawing?.clips)];
}
