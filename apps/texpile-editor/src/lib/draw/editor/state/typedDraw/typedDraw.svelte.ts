import { sourcePoint, type Point } from '../../figure/geometry';
import { BP_PER_CM } from '../../figure/lengthUnits';
import type { FigureEditorState } from '../editorState.svelte';
import type { ShapePreview } from '../gesture/canvasGesture.types';
import { readTypedAngle, readTypedLength } from './typedLength';

export type TypedField = 'length' | 'angle' | 'width' | 'height' | 'diameter';

const DEG = Math.PI / 180;

export class TypedDraw {
	values = $state<string[]>([]);
	focused = $state(0);
	open = $state(false);

	#editor: FigureEditorState;
	#preview: () => ShapePreview | null;

	constructor(editor: FigureEditorState, preview: () => ShapePreview | null) {
		this.#editor = editor;
		this.#preview = preview;
	}

	get fields(): TypedField[] {
		const p = this.#preview();
		if (p?.chained) return ['length', 'angle'];
		if (!p?.byClicks) return [];
		if (p.mode === 'threePoints') return p.points.length > 2 ? ['height'] : ['length', 'angle'];
		if (p.mode === 'circleCenter' || p.mode === 'circleTwoPoints') return ['diameter'];
		return p.mode === 'circleThreePoints' ? [] : ['width', 'height'];
	}

	start(typed: string) {
		this.values = this.fields.map((_, k) => (k === 0 ? typed : ''));
		this.focused = 0;
		this.open = true;
	}

	close() {
		this.open = false;
		this.values = [];
	}

	#read(field: TypedField) {
		const text = this.values[this.fields.indexOf(field)] ?? '';
		if (!text.trim()) return undefined;
		return field === 'angle' ? readTypedAngle(text) : readTypedLength(text);
	}

	#endAt(placed: Point[], pointer: Point): Point | null {
		const ed = this.#editor;
		const mode = this.#preview()?.mode;
		const [px, py] = ed.toCanvas(...placed.at(-1)!);
		const [ex, ey] = ed.toCanvas(...pointer);
		const [dx, dy] = [ex - px, ey - py];
		const values = this.fields.map((f) => this.#read(f));
		if (values.some((v) => v === null)) return null;
		const [first, second] = values as (number | undefined)[];
		let end: Point;
		if (this.fields[0] === 'length') {
			const r = first === undefined ? Math.hypot(dx, dy) : first * BP_PER_CM;
			const a = second === undefined ? Math.atan2(dy, dx) : second * DEG;
			end = [px + r * Math.cos(a), py + r * Math.sin(a)];
		} else if (this.fields[0] === 'diameter') {
			const r = first === undefined ? Math.hypot(dx, dy) : first * BP_PER_CM * (mode === 'circleCenter' ? 0.5 : 1);
			const a = Math.atan2(dy, dx);
			end = [px + r * Math.cos(a), py + r * Math.sin(a)];
		} else if (this.fields[0] === 'height' && placed.length === 2) {
			const [ax, ay] = ed.toCanvas(...placed[0]);
			const length = Math.hypot(px - ax, py - ay) || 1;
			const [nx, ny] = [-(py - ay) / length, (px - ax) / length];
			const across = dx * nx + dy * ny;
			const h = first === undefined ? across : first * BP_PER_CM * (across < 0 ? -1 : 1);
			end = [px + nx * h, py + ny * h];
		} else {
			const half = mode === 'center' ? 0.5 : 1;
			const w = first === undefined ? dx : first * BP_PER_CM * half * (dx < 0 ? -1 : 1);
			const h = second === undefined ? dy : second * BP_PER_CM * half * (dy < 0 ? -1 : 1);
			end = [px + w, py + h];
		}
		return sourcePoint(...end, ed.placement);
	}

	constrain(placed: Point[], pointer: Point): Point {
		return this.open ? (this.#endAt(placed, pointer) ?? pointer) : pointer;
	}

	committed(placed: Point[], pointer: Point): Point | null {
		return this.#endAt(placed, pointer);
	}
}
