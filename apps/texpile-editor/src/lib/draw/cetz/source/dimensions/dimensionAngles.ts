import type { FigureDimension } from '$lib/draw/editor/figure/figureLanguage';
import { namedArg, type CetzPicture, type CetzStatement } from '../picture';
import { closingBracket, splitArgs } from '../syntax';
import { typedText, typstText } from '../typstText';
import { readPointRef } from './dimensionRefs';

// CeTZ's own angle between two lines from one point, measuring it, in the dimension's color
const MEASURED = /^a\s*=>/;

/** `angle.angle(vertex, a, b, ...)`: the point along each ray, the ray's own end or one past the vertex from it */
export function angleText(vertex: string, [a, b]: [string, string], radius: number, label: string | null, paint: string, kept: string[]) {
	const shown =
		label === null
			? `a => text(size: 8pt, fill: ${paint})[#calc.round(a.deg(), digits: 1)°]`
			: `text(size: 8pt, fill: ${paint})[${typstText(label)}]`;
	const args = [
		vertex,
		a,
		b,
		`radius: ${radius}`,
		`label: ${shown}`,
		`label-radius: ${radius + 0.35}`,
		`mark: (symbol: ">", fill: ${paint}, length: 0.22, width: 0.09)`,
		...kept
	];
	return `angle.angle(${args.join(', ')})`;
}

/** `(v, -1, p)`: the point one past the vertex from p, as a ray that runs on through it is written */
function pastVertex(text: string) {
	if (!text.startsWith('(') || closingBracket(text, 0) !== text.length - 1) return null;
	const parts = splitArgs(text, 0, text.length - 1).map((p) => text.slice(p.value.from, p.value.to));
	return parts.length === 3 && parts[1] === '-1' ? { vertex: parts[0], from: parts[2] } : null;
}

/** an angle dimension written as CeTZ's own: what it measures, by the points it names */
export function readAngle(source: string, picture: CetzPicture, st: CetzStatement): FigureDimension | null {
	if (st.command !== 'angle') return null;
	const positional = st.args.filter((a) => !a.name).map((a) => source.slice(a.value.from, a.value.to));
	const vertex = positional[0] ? readPointRef(source, picture, positional[0]) : null;
	if (!vertex || positional.length !== 3) return null;
	const lines = positional.slice(1).map((text) => {
		const past = pastVertex(text);
		const end = readPointRef(source, picture, past ? past.from : text);
		return end && (past ? [end, vertex] : [vertex, end]);
	});
	if (!lines[0] || !lines[1]) return null;
	const body = namedArg(source, st, 'label')?.text ?? '';
	const custom = !MEASURED.test(body) && /\[([^\]]*)\]\s*$/.exec(body);
	const radius = Number(namedArg(source, st, 'radius')?.text ?? 1);
	return { kind: 'angle', lines: [lines[0], lines[1]] as never, rays: [1, 1], radius, ...(custom ? { label: typedText(custom[1]) } : {}) };
}
