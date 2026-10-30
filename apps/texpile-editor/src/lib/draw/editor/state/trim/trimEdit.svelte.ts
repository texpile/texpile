import type { FigureStatement, TrimmableShape } from '../../figure/figureLanguage';
import { canvasPoint, sourceDelta, sourcePoint, type Point, type SourceTransform } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';
import { distanceToShape, flattenPath, outlineBox, outlineCorners, trimCut, type TrimCut } from './trimGeometry';

const REACH_PX = 8;
// a cutter that ends this near the outline meets it, a hair TeX's rounding leaves
const TOUCH_BP = 0.5;

/** the piece a click would cut, `removed` in canvas bp */
export type TrimTarget = { st: FigureStatement; cut: TrimCut; removed: Point[] };

/** how long one of the statement's units is on the canvas */
function bpPerUnit(m: SourceTransform) {
	return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/** a node's outline as TeX drew it, in its own coordinates: an ellipse round it, or its corners */
function nodeOutline(ed: FigureEditorState, i: number, round: boolean, m: SourceTransform): TrimmableShape | null {
	const part = ed.render.drawing?.parts.find((p) => p.kind === 'path' && p.stmt === i);
	if (part?.kind !== 'path') return null;
	if (!round) {
		const corners = outlineCorners(part.d);
		return corners && { kind: 'polyline', runs: [{ points: corners.map((p) => sourcePoint(...p, m)), closed: true }] };
	}
	const box = outlineBox(part.d);
	if (!box) return null;
	const center = sourcePoint((box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2, m);
	const [rx] = sourceDelta((box.x2 - box.x1) / 2, 0, m);
	const [, ry] = sourceDelta(0, (box.y2 - box.y1) / 2, m);
	return { kind: 'ellipse', center, rx: Math.abs(rx), ry: Math.abs(ry) };
}

/** the Trim tool, as CAD's: every other shape cuts, and a click takes away the piece between the crossings around it */
export class TrimEdit {
	hovered = $state.raw<TrimTarget | null>(null);

	#editor: FigureEditorState;

	constructor(editor: FigureEditorState) {
		this.#editor = editor;
	}

	#targetAt(at: Point): TrimTarget | null {
		const ed = this.#editor;
		if (!ed.drawingMatchesText || !ed.picture) return null;
		const { hiddenAll, lockedAll } = ed.flags;
		const picture = ed.picture;
		const shown = picture.statements.filter((s) => !hiddenAll.has(s.i) && !lockedAll.has(s.i));
		let best: { st: FigureStatement; shape: Exclude<TrimmableShape, { kind: 'node' }>; m: SourceTransform; d: number } | null = null;
		for (const st of shown) {
			const written = ed.language.trimmable(ed.source, st);
			const m = ed.render.transformOf(st.i);
			const shape = written?.kind === 'node' ? nodeOutline(ed, st.i, written.round, m) : written;
			if (!shape || shape.kind === 'node') continue;
			const d = distanceToShape(shape, sourcePoint(...at, m)) * bpPerUnit(m);
			if (d < REACH_PX / ed.viewport.scale && (!best || d < best.d)) best = { st, shape, m, d };
		}
		if (!best) return null;
		const { st, shape, m } = best;
		// what annotates the figure cuts nothing, as a CAD dimension does not
		const cutting = new Set(shown.filter((s) => s.i !== st.i && !ed.language.readDimension(ed.source, picture, s)).map((s) => s.i));
		const cutters = (ed.render.drawing?.parts ?? [])
			.filter((p) => p.kind === 'path' && cutting.has(p.stmt))
			.flatMap((p) => (p.kind === 'path' ? flattenPath(p.d) : []))
			.map(([a, b]): [Point, Point] => [sourcePoint(...a, m), sourcePoint(...b, m)]);
		const cut = trimCut(shape, cutters, sourcePoint(...at, m), TOUCH_BP / bpPerUnit(m));
		return cut && { st, cut, removed: cut.removed.map((p) => canvasPoint(...p, m)) };
	}

	move(at: Point) {
		this.hovered = this.#targetAt(at);
	}

	/** the piece under the pointer cut away; a shape nothing crosses goes whole */
	press(at: Point) {
		const ed = this.#editor;
		const target = this.#targetAt(at);
		this.hovered = null;
		if (!target) return;
		const { st, cut } = target;
		const next = cut.left ? ed.language.writeTrimmed(ed.source, st, cut.left) : ed.language.removeStatement(ed.source, st);
		if (next) ed.applyEdit(next, cut.left ? undefined : []);
	}

	reset() {
		this.hovered = null;
	}
}
