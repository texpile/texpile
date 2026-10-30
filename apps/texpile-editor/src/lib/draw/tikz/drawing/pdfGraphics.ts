import { applyMatrix, compose, scaleOf, type Matrix } from '$lib/draw/editor/drawing/matrix';
import type { ClipRegion, DrawnPart, Gradient } from '$lib/draw/editor/drawing/drawing.types';
import { cssColor, rgbOf, roundCoordinate } from './pdfColors';

const CAPS = ['butt', 'round', 'square'] as const;
const JOINS = ['miter', 'round', 'bevel'] as const;
// a PDF image, or one whose file is unknown, shows its place, not its pixels
const PLACEHOLDER_RGB = [0.91, 0.92, 0.93];

type GraphicsState = {
	ctm: Matrix;
	stroke: number[];
	fill: number[];
	lineWidth: number;
	dash: number[] | null;
	dashPhase: number;
	cap: number;
	join: number;
	fillAlpha: number;
	strokeAlpha: number;
	clip: string | null;
	fillPattern: boolean;
	blend?: string;
};

function tokenize(ops: string) {
	return ops.match(/\[|\]|\/[^\s/[\]()<>]+|\([^)]*\)|-?\d*\.?\d+(?:e-?\d+)?|[A-Za-z*'"]+/g) ?? [];
}

/** pgf's PDF drawing operators played into drawn parts, with the graphics state they keep between them */
export class PdfGraphics {
	readonly parts: DrawnPart[] = [];
	readonly clips: ClipRegion[] = [];
	readonly gradients: Gradient[] = [];
	readonly unsupported = new Set<string>();
	/** the statement what is drawn now belongs to */
	statement = 0;
	state: GraphicsState;
	// a transparency group starts at full opacity and is laid over the page at the opacity it was placed with;
	// its parts take that opacity one by one, so overlaps inside it are not merged first
	groupAlpha = 1;
	#stack: GraphicsState[] = [];
	#groups: { alpha: number; fillAlpha: number; strokeAlpha: number }[] = [];
	#origin: [number, number] = [0, 0];
	#pendingClip: boolean | null = null;
	#path = '';

	constructor(origin: [number, number]) {
		this.state = {
			ctm: [1, 0, 0, 1, -origin[0], -origin[1]],
			stroke: [0, 0, 0],
			fill: [0, 0, 0],
			lineWidth: 1,
			dash: null,
			dashPhase: 0,
			cap: 0,
			join: 0,
			fillAlpha: 1,
			strokeAlpha: 1,
			clip: null,
			fillPattern: false
		};
	}

	// what luatex's backend does: a literal's origin is where it sits in the box, a glyph is placed from the page origin
	moveOrigin(to: [number, number]) {
		this.state.ctm = compose(this.state.ctm, [1, 0, 0, 1, to[0] - this.#origin[0], to[1] - this.#origin[1]]);
		this.#origin = to;
	}

	#formatPathPoint(x: number, y: number) {
		return applyMatrix(this.state.ctm, x, y).map(roundCoordinate).join(' ');
	}

	#formatRectanglePath(x1: number, y1: number, x2: number, y2: number) {
		const [a, b, c, d] = [
			this.#formatPathPoint(x1, y1),
			this.#formatPathPoint(x2, y1),
			this.#formatPathPoint(x2, y2),
			this.#formatPathPoint(x1, y2)
		];
		return `M${a}L${b}L${c}L${d}Z`;
	}

	beginGroup() {
		const gs = this.state;
		this.#groups.push({ alpha: this.groupAlpha, fillAlpha: gs.fillAlpha, strokeAlpha: gs.strokeAlpha });
		this.groupAlpha *= gs.fillAlpha;
		gs.fillAlpha = gs.strokeAlpha = 1;
	}

	endGroup() {
		const g = this.#groups.pop();
		if (g) ({ alpha: this.groupAlpha, fillAlpha: this.state.fillAlpha, strokeAlpha: this.state.strokeAlpha } = g);
	}

	#paintPath(stroke: boolean, fill: boolean, evenOdd = false, shading: string | null = null) {
		const gs = this.state;
		let gradient = shading;
		if (fill && !gradient && gs.fillPattern) {
			gradient = `hatch${this.gradients.length + 1}`;
			this.gradients.push({
				id: gradient,
				kind: 'hatch',
				from: [0, 0],
				to: [0, 0],
				radius: 0,
				focus: [0, 0],
				transform: [],
				stops: [{ offset: 0, color: cssColor(gs.fill) }]
			});
		}
		if ((stroke || fill) && this.#path) {
			const s = scaleOf(gs.ctm);
			this.parts.push({
				kind: 'path',
				stmt: this.statement,
				clip: gs.clip,
				...(gs.blend && { blend: gs.blend }),
				d: this.#path,
				fill: fill ? cssColor(gs.fill) : null,
				gradient,
				fillOpacity: gs.fillAlpha * this.groupAlpha,
				evenOdd,
				stroke: stroke ? cssColor(gs.stroke) : null,
				strokeWidth: roundCoordinate(gs.lineWidth * s),
				strokeOpacity: gs.strokeAlpha * this.groupAlpha,
				dash: stroke && gs.dash?.length ? gs.dash.map((v) => roundCoordinate(v * s)).join(' ') : null,
				dashOffset: stroke && gs.dash?.length ? roundCoordinate(gs.dashPhase * s) : 0,
				cap: CAPS[gs.cap] ?? 'butt',
				join: JOINS[gs.join] ?? 'miter'
			});
		}
		// W marks the path as a clip from after this paint on, never for it
		if (this.#pendingClip !== null) {
			const id = `clip${this.clips.length + 1}`;
			this.clips.push({ id, d: this.#path, evenOdd: this.#pendingClip, parent: gs.clip });
			gs.clip = id;
			this.#pendingClip = null;
		}
		this.#path = '';
	}

	fillRectangle(x1: number, y1: number, x2: number, y2: number, shading: string | null = null) {
		this.#path = this.#formatRectanglePath(x1, y1, x2, y2);
		this.#paintPath(false, true, false, shading);
	}

	fillPlaceholder(x1: number, y1: number, x2: number, y2: number) {
		const fill = this.state.fill;
		this.state.fill = PLACEHOLDER_RGB;
		this.fillRectangle(x1, y1, x2, y2);
		this.state.fill = fill;
	}

	clearPath() {
		this.#path = '';
	}

	/** one operator with the operands before it: `name` is the last /Name among them */
	#runOperator(op: string, operands: (number | number[])[], name: string | null) {
		const n = operands.filter((v): v is number => typeof v === 'number');
		switch (op) {
			case 'q':
				this.#stack.push({ ...this.state });
				break;
			case 'Q':
				this.state = this.#stack.pop() ?? this.state;
				break;
			case 'cm':
				this.state.ctm = compose(this.state.ctm, n);
				break;
			case 'w':
				this.state.lineWidth = n[0];
				break;
			case 'J':
				this.state.cap = n[0];
				break;
			case 'j':
				this.state.join = n[0];
				break;
			case 'd': {
				// `[on off ...] phase d`
				const at = operands.findIndex(Array.isArray);
				this.state.dash = at < 0 ? null : (operands[at] as number[]);
				this.state.dashPhase = at < 0 ? 0 : Number(operands[at + 1] ?? 0);
				break;
			}
			case 'g':
			case 'rg':
			case 'k':
			case 'sc':
			case 'scn':
				if (n.length) this.state.fill = rgbOf(n);
				this.state.fillPattern = op === 'scn' && !!name?.startsWith('/pgfpat');
				break;
			case 'G':
			case 'RG':
			case 'K':
			case 'SC':
			case 'SCN':
				this.state.stroke = rgbOf(n);
				break;
			case 'gs': {
				const m = name?.match(/pgf@(CA|ca)([\d.]+)/);
				// pgf's blend modes are PDF's names, ColorDodge for CSS's color-dodge
				const blend = name
					?.match(/pgf@bm(\w+)/)?.[1]
					.replace(/(?<=.)([A-Z])/g, '-$1')
					.toLowerCase();
				if (blend) this.state.blend = blend === 'normal' ? undefined : blend;
				else if (m?.[1] === 'CA') this.state.strokeAlpha = Number(m[2]);
				else if (m) this.state.fillAlpha = Number(m[2]);
				else this.unsupported.add(`gs ${name}`);
				break;
			}
			case 'm':
				this.#path += `M${this.#formatPathPoint(n[0], n[1])}`;
				break;
			case 'l':
				this.#path += `L${this.#formatPathPoint(n[0], n[1])}`;
				break;
			case 'c':
				this.#path += `C${this.#formatPathPoint(n[0], n[1])} ${this.#formatPathPoint(n[2], n[3])} ${this.#formatPathPoint(n[4], n[5])}`;
				break;
			case 'v':
				this.unsupported.add('v');
				break;
			case 'y':
				this.#path += `C${this.#formatPathPoint(n[0], n[1])} ${this.#formatPathPoint(n[2], n[3])} ${this.#formatPathPoint(n[2], n[3])}`;
				break;
			case 'h':
				this.#path += 'Z';
				break;
			case 're': {
				const [x, y, w, h] = n;
				this.#path += this.#formatRectanglePath(x, y, x + w, y + h);
				break;
			}
			case 'S':
				this.#paintPath(true, false);
				break;
			case 's':
				this.#path += 'Z';
				this.#paintPath(true, false);
				break;
			case 'f':
			case 'F':
				this.#paintPath(false, true);
				break;
			case 'f*':
				this.#paintPath(false, true, true);
				break;
			case 'B':
				this.#paintPath(true, true);
				break;
			case 'B*':
				this.#paintPath(true, true, true);
				break;
			case 'b':
				this.#path += 'Z';
				this.#paintPath(true, true);
				break;
			case 'b*':
				this.#path += 'Z';
				this.#paintPath(true, true, true);
				break;
			case 'n':
				this.#paintPath(false, false);
				break;
			case 'W':
				this.#pendingClip = false;
				break;
			case 'W*':
				this.#pendingClip = true;
				break;
			case 'M':
			case 'cs':
			case 'CS':
				break;
			default:
				this.unsupported.add(op);
		}
	}

	runOperators(ops: string) {
		let operands: (number | number[])[] = [];
		let array: number[] | null = null;
		let name: string | null = null;
		for (const t of tokenize(ops)) {
			if (t === '[') array = [];
			else if (t === ']') {
				operands.push(array ?? []);
				array = null;
			} else if (/^-?\d*\.?\d/.test(t)) (array ?? operands).push(Number(t));
			else if (t[0] === '/') name = t;
			else if (t[0] === '(') continue;
			else {
				this.#runOperator(t, operands, name);
				operands = [];
				name = null;
			}
		}
	}
}
