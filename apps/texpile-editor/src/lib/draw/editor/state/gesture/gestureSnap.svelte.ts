import { sourcePoint, type Point } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';
import { findSnap, trackSnap } from '../snap/findSnap';
import type { Snap } from '../snap/snapScene.types';
import { nearestGuide, SNAP_STEP } from '../snapTargets';
import type { Guide, StatementBox } from '../snapTargets.types';

import { SNAP_REACH_PX } from './gestureThresholds';

const OFF_GRID = SNAP_STEP.fine / 4;

export class GestureSnap {
	guides = $state.raw<Guide[]>([]);
	mark = $state.raw<Snap | null>(null);

	#editor: FigureEditorState;

	constructor(editor: FigureEditorState) {
		this.#editor = editor;
	}

	step(e: MouseEvent | KeyboardEvent) {
		return e.ctrlKey || e.metaKey || !this.#editor.gridShown ? SNAP_STEP.fine : SNAP_STEP.grid;
	}

	clearMark() {
		this.mark = null;
	}

	clearGuides() {
		this.guides = [];
	}

	toPoint(at: Point, exclude: number[], from: Point | null = null): Point | null {
		const ed = this.#editor;
		this.mark = findSnap(ed.snapScene, { at, reach: SNAP_REACH_PX / ed.viewport.scale, exclude, from });
		return this.mark?.at ?? null;
	}

	trackPoint(raw: Point, placed: Point, exclude: number[]): Point | null {
		const ed = this.#editor;
		const tracked = trackSnap(ed.snapScene, raw, placed, SNAP_REACH_PX / ed.viewport.scale, exclude);
		this.guides = tracked?.guides ?? [];
		return tracked?.point ?? null;
	}

	placeNew(at: Point, e: MouseEvent, from: Point | null = null): Point {
		const ed = this.#editor;
		this.guides = [];
		const onPoint = this.toPoint(at, [], from && ed.toCanvas(...from));
		if (onPoint) return sourcePoint(...onPoint, ed.placement);
		const grid = ed.toSource(...at, this.step(e));
		const tracked = this.trackPoint(at, ed.toCanvas(...grid), []);
		if (!tracked) return grid;
		// a hair off the grid is the grid
		const [u, v] = sourcePoint(...tracked, ed.placement);
		return [Math.abs(u - grid[0]) < OFF_GRID ? grid[0] : u, Math.abs(v - grid[1]) < OFF_GRID ? grid[1] : v];
	}

	alignBox(box: StatementBox | null, travel: Point, placed: Point, exclude: number[]): Point {
		this.guides = [];
		if (!box) return placed;
		const reach = SNAP_REACH_PX / this.#editor.viewport.scale;
		const boxes = this.#editor.snapBoxes;
		const xs = [box.x1, (box.x1 + box.x2) / 2, box.x2].map((x) => x + travel[0]);
		const ys = [box.y1, (box.y1 + box.y2) / 2, box.y2].map((y) => y + travel[1]);
		const gx = nearestGuide(boxes, 'x', xs, [box.y1 + travel[1], box.y2 + travel[1]], reach, exclude);
		const gy = nearestGuide(boxes, 'y', ys, [box.x1 + travel[0], box.x2 + travel[0]], reach, exclude);
		this.guides = [gx?.guide, gy?.guide].filter((g) => !!g);
		return [gx ? travel[0] + gx.shift : placed[0], gy ? travel[1] + gy.shift : placed[1]];
	}
}
