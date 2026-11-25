// a 2d context that records what a painter draws, in doc space (probe.drawList, the unit tests' canvases)
import type { DocRect, TextMeasure } from '../contracts/layoutTypes';
import type { PaintOpRecord } from '../contracts/probeTypes';

type Matrix = readonly [number, number, number, number, number, number];
type Point = { x: number; y: number };
type RecordedState = { matrix: Matrix; values: Record<string, unknown> };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const DEFAULTS: Record<string, unknown> = {
	fillStyle: '#000000',
	strokeStyle: '#000000',
	font: '10px sans-serif',
	lineWidth: 1,
	globalAlpha: 1,
	textAlign: 'start',
	textBaseline: 'alphabetic',
	letterSpacing: '0px',
	globalCompositeOperation: 'source-over',
	lineCap: 'butt',
	lineJoin: 'miter',
	imageSmoothingEnabled: true
};
/** calls that change nothing a record holds */
const SILENT = ['clearRect', 'clip', 'setLineDash', 'putImageData', 'drawFocusIfNeeded', 'reset'];
/** the alphabetic baseline sits about this far down a line of the font's size */
const ASCENT_EM = 0.8;

function multiply(m: Matrix, n: Matrix): Matrix {
	return [
		m[0] * n[0] + m[2] * n[1],
		m[1] * n[0] + m[3] * n[1],
		m[0] * n[2] + m[2] * n[3],
		m[1] * n[2] + m[3] * n[3],
		m[0] * n[4] + m[2] * n[5] + m[4],
		m[1] * n[4] + m[3] * n[5] + m[5]
	];
}

function fontSizeOf(font: string): number {
	return Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
}

function colorOf(style: unknown): string {
	return typeof style === 'string' ? style : '[pattern]';
}

export class DrawListRecorder {
	readonly ops: PaintOpRecord[] = [];
	/** typed as the real context, so a painter cannot tell it apart */
	readonly context: CanvasRenderingContext2D;
	private matrix: Matrix = IDENTITY;
	private values: Record<string, unknown> = { ...DEFAULTS };
	private readonly stack: RecordedState[] = [];
	private path: Point[] = [];

	/** offset: where the context's origin sits in doc space (a block's top) */
	constructor(
		private readonly measure: TextMeasure,
		private readonly offset: Point = { x: 0, y: 0 }
	) {
		const methods = this.methods();
		this.context = new Proxy({} as CanvasRenderingContext2D, {
			get: (_target, key) => {
				if (typeof key !== 'string') return undefined;
				if (key in methods) return methods[key];
				if (SILENT.includes(key)) return () => undefined;
				return this.values[key];
			},
			set: (_target, key, value) => {
				if (typeof key === 'string') this.values[key] = value;
				return true;
			}
		});
	}

	private methods(): Record<string, (...args: never[]) => unknown> {
		return {
			save: () => this.stack.push({ matrix: this.matrix, values: { ...this.values } }),
			restore: () => {
				const top = this.stack.pop();
				if (top) ({ matrix: this.matrix, values: this.values } = top);
			},
			setTransform: (a: number | DOMMatrix2DInit, b = 0, c = 0, d = 1, e = 0, f = 0) => {
				this.matrix = typeof a === 'number' ? [a, b, c, d, e, f] : [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
			},
			resetTransform: () => (this.matrix = IDENTITY),
			getTransform: () => {
				const [a, b, c, d, e, f] = this.matrix;
				return { a, b, c, d, e, f } as DOMMatrix;
			},
			transform: (a: number, b: number, c: number, d: number, e: number, f: number) =>
				(this.matrix = multiply(this.matrix, [a, b, c, d, e, f])),
			translate: (x: number, y: number) => (this.matrix = multiply(this.matrix, [1, 0, 0, 1, x, y])),
			scale: (x: number, y: number) => (this.matrix = multiply(this.matrix, [x, 0, 0, y, 0, 0])),
			rotate: (angle: number) =>
				(this.matrix = multiply(this.matrix, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0])),
			fillRect: (x: number, y: number, w: number, h: number) =>
				this.record(
					'fillRect',
					this.box([
						{ x, y },
						{ x: x + w, y: y + h }
					]),
					'fillStyle'
				),
			strokeRect: (x: number, y: number, w: number, h: number) =>
				this.record(
					'strokeRect',
					this.box([
						{ x, y },
						{ x: x + w, y: y + h }
					]),
					'strokeStyle'
				),
			fillText: (text: string, x: number, y: number) => this.text(text, x, y, 'fillStyle'),
			strokeText: (text: string, x: number, y: number) => this.text(text, x, y, 'strokeStyle'),
			measureText: (text: string) => ({ width: this.measure(String(this.values.font), text) }),
			drawImage: (...args: number[]) => {
				const [x, y, w, h] = args.length >= 9 ? args.slice(5, 9) : args.slice(1, 5);
				this.record(
					'image',
					this.box([
						{ x, y },
						{ x: x + (w ?? 0), y: y + (h ?? 0) }
					])
				);
			},
			beginPath: () => (this.path = []),
			closePath: () => undefined,
			moveTo: (x: number, y: number) => this.path.push(this.point(x, y)),
			lineTo: (x: number, y: number) => this.path.push(this.point(x, y)),
			rect: (x: number, y: number, w: number, h: number) => this.path.push(this.point(x, y), this.point(x + w, y + h)),
			roundRect: (x: number, y: number, w: number, h: number) => this.path.push(this.point(x, y), this.point(x + w, y + h)),
			arc: (x: number, y: number, r: number) => this.path.push(this.point(x - r, y - r), this.point(x + r, y + r)),
			ellipse: (x: number, y: number, rx: number, ry: number) => this.path.push(this.point(x - rx, y - ry), this.point(x + rx, y + ry)),
			arcTo: (x1: number, y1: number, x2: number, y2: number) => this.path.push(this.point(x1, y1), this.point(x2, y2)),
			quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => this.path.push(this.point(cx, cy), this.point(x, y)),
			bezierCurveTo: (ax: number, ay: number, bx: number, by: number, x: number, y: number) =>
				this.path.push(this.point(ax, ay), this.point(bx, by), this.point(x, y)),
			fill: () => this.pathOp('path', 'fillStyle'),
			stroke: () => this.pathOp(this.path.length === 2 ? 'line' : 'path', 'strokeStyle'),
			getLineDash: () => [],
			createLinearGradient: () => ({ addColorStop: () => undefined }),
			createRadialGradient: () => ({ addColorStop: () => undefined }),
			createPattern: () => null,
			isPointInPath: () => false
		};
	}

	/** a point in doc space; the offset places the context's origin */
	private point(x: number, y: number): Point {
		const m = this.matrix;
		return { x: m[0] * x + m[2] * y + m[4] + this.offset.x, y: m[1] * x + m[3] * y + m[5] + this.offset.y };
	}

	private box(points: readonly Point[]): DocRect {
		const mapped = points.map((p) => this.point(p.x, p.y));
		const xs = mapped.map((p) => p.x);
		const ys = mapped.map((p) => p.y);
		const x = Math.min(...xs);
		const y = Math.min(...ys);
		return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
	}

	private text(text: string, x: number, y: number, paint: 'fillStyle' | 'strokeStyle'): void {
		const font = String(this.values.font);
		const size = fontSizeOf(font);
		const width = this.measure(font, text);
		const top = y - size * ASCENT_EM;
		this.ops.push({
			op: 'fillText',
			rect: this.box([
				{ x, y: top },
				{ x: x + width, y: top + size }
			]),
			text,
			font,
			color: colorOf(this.values[paint])
		});
	}

	private pathOp(op: 'path' | 'line', paint: 'fillStyle' | 'strokeStyle'): void {
		if (!this.path.length) return;
		const xs = this.path.map((p) => p.x);
		const ys = this.path.map((p) => p.y);
		const x = Math.min(...xs);
		const y = Math.min(...ys);
		this.ops.push({ op, rect: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, color: colorOf(this.values[paint]) });
	}

	private record(op: PaintOpRecord['op'], rect: DocRect, paint?: 'fillStyle' | 'strokeStyle'): void {
		this.ops.push(paint ? { op, rect, color: colorOf(this.values[paint]) } : { op, rect });
	}
}
