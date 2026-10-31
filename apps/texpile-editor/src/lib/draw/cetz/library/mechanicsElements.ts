import { element } from './libraryElement';
import { grouped } from './shapeOutlines';

// a free body diagram's parts as a statics textbook draws them: supports on hatched ground, loads, beams
function mechanics(id: string, name: string, statements: string[]) {
	return element('Mechanics', id, name, statements.length > 1 ? grouped(statements) : statements[0]);
}

const ARROW = 'mark: (end: "stealth", fill: black, scale: 0.6)';
const THICK = 'stroke: 1pt';
const BEAM = 'fill: gray.lighten(80%), stroke: 1pt';

function round(n: number) {
	return Number(n.toFixed(2));
}

/** the short strokes under (or beside) a ground line, every 0.2 from `from` to `to`, each going `by` from its foot */
function hatch(from: number, to: number, foot: (t: number) => [number, number], by: [number, number]) {
	const count = Math.round((to - from) / 0.2);
	return Array.from({ length: count + 1 }, (_, k) => {
		const [x, y] = foot(round(from + k * 0.2));
		return `line((${x}, ${y}), (${round(x + by[0])}, ${round(y + by[1])}))`;
	});
}

const DOWN_LEFT: [number, number] = [-0.15, -0.15];

function pin(x: number): string[] {
	return [
		`line((${x}, 0), (${round(x - 0.3)}, -0.5), (${round(x + 0.3)}, -0.5), close: true, ${THICK})`,
		`line((${round(x - 0.5)}, -0.5), (${round(x + 0.5)}, -0.5), ${THICK})`,
		...hatch(x - 0.4, x + 0.4, (t) => [t, -0.5], DOWN_LEFT)
	];
}

function roller(x: number): string[] {
	return [
		`line((${x}, 0), (${round(x - 0.3)}, -0.4), (${round(x + 0.3)}, -0.4), close: true, ${THICK})`,
		`circle((${round(x - 0.2)}, -0.5), radius: 0.1, ${THICK})`,
		`circle((${round(x + 0.2)}, -0.5), radius: 0.1, ${THICK})`,
		`line((${round(x - 0.5)}, -0.6), (${round(x + 0.5)}, -0.6), ${THICK})`,
		...hatch(x - 0.4, x + 0.4, (t) => [t, -0.6], DOWN_LEFT)
	];
}

export const MECHANICS = [
	mechanics('pin-support', 'Pin support', pin(0)),
	mechanics('roller-support', 'Roller support', roller(0)),
	mechanics('fixed-support', 'Fixed support', [`line((0, -0.6), (0, 0.6), ${THICK})`, ...hatch(-0.4, 0.6, (t) => [0, t], DOWN_LEFT)]),
	mechanics('ground', 'Ground', [`line((-1.5, 0), (1.5, 0), ${THICK})`, ...hatch(-1.3, 1.5, (t) => [t, 0], DOWN_LEFT)]),
	mechanics('point-load', 'Point load', [
		`line((0, 1.5), (0, 0), stroke: 1.2pt, ${ARROW})`,
		'content((0, 1.5), [$P$], anchor: "south", padding: 0.1)'
	]),
	mechanics('distributed-load', 'Distributed load', [
		'line((-1.5, 0.8), (1.5, 0.8))',
		...[-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((x) => `line((${x}, 0.8), (${x}, 0), ${ARROW})`),
		'content((0, 0.8), [$w$], anchor: "south", padding: 0.1)'
	]),
	mechanics('linear-load', 'Linearly varying load', [
		'line((-1.5, 0), (1.5, 1.2))',
		...[-1, -0.5, 0, 0.5, 1, 1.5].map((x) => `line((${x}, ${round(0.4 * (x + 1.5))}), (${x}, 0), ${ARROW})`),
		'content((1.5, 1.2), [$w_0$], anchor: "south", padding: 0.1)'
	]),
	mechanics('moment', 'Moment', [
		`arc((0.5, 0), start: 0deg, stop: 270deg, radius: 0.5, ${THICK}, ${ARROW})`,
		'circle((0, 0), radius: 0.05, fill: black, stroke: none)',
		'content((0.6, 0.6), [$M$])'
	]),
	mechanics('simply-supported-beam', 'Simply supported beam', [
		`rect((-2.5, 0), (2.5, 0.3), ${BEAM})`,
		...pin(-2.5),
		...roller(2.5),
		'content((-2.5, 0.3), [$A$], anchor: "south-east", padding: 0.1)',
		'content((2.5, 0.3), [$B$], anchor: "south-west", padding: 0.1)'
	]),
	mechanics('cantilever', 'Cantilever beam', [
		`line((-2.5, -0.8), (-2.5, 0.8), ${THICK})`,
		...hatch(-0.6, 0.8, (t) => [-2.5, t], DOWN_LEFT),
		`rect((-2.5, -0.15), (2.5, 0.15), ${BEAM})`,
		`line((2.5, 1.3), (2.5, 0.15), stroke: 1.2pt, ${ARROW})`,
		'content((2.5, 1.3), [$P$], anchor: "south", padding: 0.1)'
	]),
	mechanics('i-beam-section', 'I-beam section', [
		`rect((-1.2, -1.5), (1.2, -1.2), ${BEAM})`,
		`rect((-0.15, -1.2), (0.15, 1.2), ${BEAM})`,
		`rect((-1.2, 1.2), (1.2, 1.5), ${BEAM})`
	]),
	mechanics('damper', 'Damper', [
		'line((-1.5, 0), (-0.4, 0))',
		'line((0.5, 0.3), (-0.4, 0.3), (-0.4, -0.3), (0.5, -0.3))',
		`line((0.1, -0.22), (0.1, 0.22), ${THICK})`,
		'line((0.1, 0), (1.5, 0))'
	]),
	mechanics('pulley', 'Pulley with two masses', [
		`line((-0.8, 1.6), (0.8, 1.6), ${THICK})`,
		...hatch(-0.6, 0.8, (t) => [t, 1.6], [-0.15, 0.15]),
		'line((0, 1.6), (0, 0))',
		`circle((0, 0), radius: 0.5, ${THICK})`,
		'circle((0, 0), radius: 0.05, fill: black, stroke: none)',
		'line((-0.5, 0), (-0.5, -1.2))',
		'line((0.5, 0), (0.5, -0.6))',
		'rect((-0.8, -1.2), (-0.2, -1.7), fill: gray.lighten(80%))',
		'rect((0.2, -0.6), (0.8, -1.1), fill: gray.lighten(80%))',
		'content((-0.5, -1.45), [$m_1$])',
		'content((0.5, -0.85), [$m_2$])'
	])
];
