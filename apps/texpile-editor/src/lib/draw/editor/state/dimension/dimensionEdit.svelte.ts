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

/** `written`: the dimension statement it already is; `label`: what it prints instead of its value */
export type PlacedDimension = { target: DimensionTarget; placement: DimensionPlacement; written?: number; label?: string };

export class DimensionEdit {
	hovered = $state.raw<DimensionHit | null>(null);
	picks = $state.raw<DimensionHit[]>([]);
	pointer = $state.raw<Point | null>(null);
	placed = $state.raw<PlacedDimension | null>(null);

	measured = $derived(measuredBy(this.picks));
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

	reopen(st: FigureStatement) {
		const ed = this.#editor;
		const found = ed.picture && ed.language.readDimension(ed.source, ed.picture, st);
		const placed = found && dimensionTargetOf(ed, found);
		if (!placed) return false;
		this.picks = [];
		this.placed = { ...placed, written: st.i, label: found.label };
		return true;
	}

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
