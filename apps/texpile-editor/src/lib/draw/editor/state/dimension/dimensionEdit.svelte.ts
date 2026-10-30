import type { FigureStatement } from '../../figure/figureLanguage';
import type { Point } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';
import { dimensionedSource } from './dimensionEdits';
import { measuredBy, pickKey } from './dimensionPicks';
import { placementAt } from './dimensionPlacement';
import { dimensionTargetOf } from './dimensionReopen';
import type { DimensionHit, DimensionPlacement, DimensionTarget } from './dimensionTargets.types';
import { figureDimension } from './dimensionWrite';
import { dimensionValue } from './geometry/dimensionGeometry';
import { dimensionAt } from './hits/dimensionHits';

const REACH_PX = 8;
const POINT_REACH_PX = 6;

/** a dimension put down, its value being typed; `written` is the dimension statement it is already, when it is, and
 *  `label` what it prints instead of its value */
export type PlacedDimension = { target: DimensionTarget; placement: DimensionPlacement; written?: number; label?: string };

/** the Dimension tool, as FreeCAD's: picks, then the dimension where the pointer puts it, then its value typed */
export class DimensionEdit {
	hovered = $state.raw<DimensionHit | null>(null);
	picks = $state.raw<DimensionHit[]>([]);
	/** where the pointer is, in bp, which a dimension being put follows */
	pointer = $state.raw<Point | null>(null);
	placed = $state.raw<PlacedDimension | null>(null);

	/** what the picks measure */
	measured = $derived(measuredBy(this.picks));
	/** the dimension as the pointer puts it, before a click puts it down */
	following = $derived.by((): PlacedDimension | null => {
		const target = this.measured;
		return target && this.pointer && !this.placed ? { target, placement: placementAt(target, this.pointer) } : null;
	});

	#editor: FigureEditorState;

	constructor(editor: FigureEditorState) {
		this.#editor = editor;
	}

	#hitAt(at: Point) {
		const ed = this.#editor;
		if (!ed.drawingMatchesText) return null;
		const { hiddenAll, lockedAll } = ed.flags;
		const statements = (ed.picture?.statements ?? []).filter((s) => !hiddenAll.has(s.i) && !lockedAll.has(s.i));
		const outlined = new Set((ed.render.drawing?.parts ?? []).filter((p) => p.kind === 'path').map((p) => p.stmt));
		// a turned node's drawn box is not its outline
		function turned(i: number) {
			const st = statements.find((s) => s.i === i);
			return !st || !!ed.language.readRotation(ed.source, st);
		}
		const outlines = ed.snapBoxes.filter((b) => outlined.has(b.stmt) && !turned(b.stmt));
		const scene = { language: ed.language, source: ed.source, statements, transformOf: (i: number) => ed.render.transformOf(i), outlines };
		const scale = ed.viewport.scale;
		return dimensionAt(scene, at, REACH_PX / scale, POINT_REACH_PX / scale);
	}

	move(at: Point) {
		this.pointer = at;
		this.hovered = this.placed ? null : this.#hitAt(at);
	}

	/** a press: something under the pointer is picked, or let go when it was; on the empty canvas the dimension the
	 *  picks make is put down where the pointer is, and its value is typed next */
	press(at: Point) {
		this.placed = null;
		const hit = this.#hitAt(at);
		if (hit) {
			const key = pickKey(hit);
			const kept = this.picks.filter((p) => pickKey(p) !== key);
			this.picks = kept.length < this.picks.length ? kept : [...this.picks, hit];
			this.hovered = null;
			return;
		}
		const target = this.measured;
		if (target) this.placed = { target, placement: placementAt(target, at) };
		else this.picks = [];
	}

	/** a dimension written before, put down again to type its value */
	reopen(st: FigureStatement) {
		const ed = this.#editor;
		const found = ed.picture && ed.language.readDimension(ed.source, ed.picture, st);
		const placed = found && dimensionTargetOf(ed, found);
		if (!placed) return false;
		this.picks = [];
		this.placed = { ...placed, written: st.i, label: found.label };
		return true;
	}

	/** text typed that is not a size: the dimension prints it, and the shape stays as it is */
	name(label: string) {
		const ed = this.#editor;
		const p = this.placed;
		if (!p || ed.language.textProblem(label)) return false;
		const dimension = p.written === undefined && figureDimension(p.target, p.placement, dimensionValue(p.target, p.placement));
		const next =
			p.written === undefined
				? dimension && ed.language.addDimension(ed.source, ed.shownIndex, { ...dimension, label })
				: ed.language.relabelDimension(ed.source, ed.shownIndex, p.written, label);
		if (!next) return false;
		this.placed = null;
		this.picks = [];
		ed.applyEdit(next);
		return true;
	}

	/** the value typed, and the dimension written into the figure where it is new, as one undo step */
	apply(value: number) {
		const ed = this.#editor;
		const p = this.placed;
		if (!p) return false;
		const same = Math.abs(value - dimensionValue(p.target, p.placement)) < 1e-6;
		let next = same ? ed.source : dimensionedSource(ed.language, ed.source, p.target, p.placement, value);
		if (next === null) return false;
		if (p.written === undefined) {
			const dimension = figureDimension(p.target, p.placement, value);
			next = (dimension && ed.language.addDimension(next, ed.shownIndex, dimension)) ?? next;
		} else {
			// a size typed on a named dimension measures it again
			if (p.label !== undefined) next = ed.language.relabelDimension(next, ed.shownIndex, p.written, null) ?? next;
			if (p.target.kind === 'radius') next = relabelled(ed, next, p.written, value);
		}
		this.placed = null;
		this.picks = [];
		if (next !== ed.source) ed.applyEdit(next);
		return true;
	}

	/** a step back: the dimension put down, else the picks; false when there was neither */
	clear() {
		if (this.placed) this.placed = null;
		else if (this.picks.length) this.picks = [];
		else return false;
		return true;
	}

	reset() {
		this.hovered = null;
		this.picks = [];
		this.placed = null;
	}
}

/** a radius reads its value as written, so it is written again once the radius is set */
function relabelled(ed: FigureEditorState, source: string, written: number, value: number) {
	const st = ed.language.readPicture(source, ed.shownIndex)?.statements.find((s) => s.i === written);
	if (!st) return source;
	const text = source.slice(st.from, st.to).replace(/\{R -?\d*\.?\d+\}/, `{R ${Number(value.toFixed(2))}}`);
	return source.slice(0, st.from) + text + source.slice(st.to);
}
