import type { Point } from '../figure/geometry';
import type { FigureEditorState } from '../state/editorState.svelte';
import { gridPlaces, placeStep, type GridPlace } from './slotPlaces';

/** a commutative diagram on the canvas: its grid, the places a cell can go, and the edits that put cells there */
export class DiagramCells {
	#editor: FigureEditorState;
	grid = $derived.by(() => {
		const ed = this.#editor;
		return ed.picture ? ed.language.readGrid(ed.source, ed.picture) : null;
	});
	places = $derived.by((): GridPlace[] => {
		const ed = this.#editor;
		return this.grid && ed.drawingMatchesText ? gridPlaces(this.grid, ed.render.slots) : [];
	});
	step = $derived(placeStep(this.places));
	/** where the first cell was drawn, and the rows and columns the last edit added before it */
	#first: { index: number; at: Point } | null = null;
	#grown: [number, number] = [0, 0];

	constructor(editor: FigureEditorState) {
		this.#editor = editor;
	}

	/** tikz-cd centers its grid on the picture's origin, so a column added shifts every cell: the view goes with
	 *  them, and the cells already there stay put on screen */
	drawn() {
		const ed = this.#editor;
		const slots = ed.render.slots;
		const [sr, sc] = this.#grown;
		this.#grown = [0, 0];
		const now = slots.find((s) => s.r === 1 + sr && s.c === 1 + sc);
		const last = this.#first;
		if (last && now && last.index === ed.render.drawnIndex && ed.viewport.fitted) {
			ed.viewport.cx += now.at[0] - last.at[0];
			ed.viewport.cy += now.at[1] - last.at[1];
		}
		const first = slots.find((s) => s.r === 1 && s.c === 1);
		this.#first = first ? { index: ed.render.drawnIndex, at: first.at } : null;
	}

	/** a new cell's text, selected and ready to type into */
	add(place: GridPlace) {
		const ed = this.#editor;
		this.#grown = [Math.max(0, 1 - place.r), Math.max(0, 1 - place.c)];
		const done = ed.language.addCell(ed.source, ed.shownIndex, place.r, place.c, 'X');
		if (done) ed.applyPlaced(done, true);
	}

	move(i: number, place: GridPlace) {
		const ed = this.#editor;
		this.#grown = [Math.max(0, 1 - place.r), Math.max(0, 1 - place.c)];
		const done = ed.language.moveCell(ed.source, ed.shownIndex, i, place.r, place.c);
		if (done) ed.applyPlaced(done, false);
	}
}
