import { element } from './libraryElement';
import { grouped } from './shapeOutlines';

function math(id: string, name: string, statements: string[], libraries: string[] = []) {
	return element('Math', id, name, statements.length > 1 ? grouped(statements) : statements[0], libraries);
}

const ARROW = 'mark: (end: "straight")';
const DOT = 'fill: black, stroke: none';

const AXES = [
	`line((-2, 0), (2, 0), ${ARROW})`,
	'content((2, 0), [$x$], anchor: "west", padding: 0.1)',
	`line((0, -1.5), (0, 2), ${ARROW})`,
	'content((0, 2), [$y$], anchor: "south", padding: 0.1)'
];

// samples of sin(1.6x) from -2 to 2, every quarter
const SINE = Array.from({ length: 17 }, (_, k) => {
	const x = -2 + k / 4;
	return `(${x}, ${Number(Math.sin(1.6 * x).toFixed(2))})`;
});

export const MATH = [
	math('axes', 'Axes', AXES),
	math('grid', 'Grid', ['grid((-2, -1.5), (2, 1.5), step: 0.5, stroke: 0.5pt + gray)']),
	math('graph', 'Graph of a function', [...AXES, 'bezier((-1.4, 1.96), (1.4, 1.96), (0, -1.96), stroke: 2pt + blue)']),
	math('point', 'Point', [`circle((0, 0), radius: 0.07, ${DOT})`, 'content((0, 0), [$P$], anchor: "south-west", padding: 0.1)']),
	math('vector', 'Vector', [
		'line((-1, -0.5), (1, 0.5), stroke: 2pt, mark: (end: "stealth", fill: black))',
		'content((0, 0), [$arrow(v)$], anchor: "south-east", padding: 0.1)'
	]),
	math(
		'angle',
		'Angle',
		[
			'line((-1, -0.5), (1, -0.5))',
			'line((-1, -0.5), (0.5, 0.8))',
			'angle.angle((-1, -0.5), (1, -0.5), (0.5, 0.8), radius: 0.6, label: $alpha$, label-radius: 0.85)'
		],
		['angle']
	),
	math('right-angle', 'Right angle', ['line((-1, -1), (1, -1))', 'line((-1, -1), (-1, 1))', 'line((-0.7, -1), (-0.7, -0.7), (-1, -0.7))']),
	math('labeled-triangle', 'Triangle ABC', [
		'line((-1.5, -1), (1.5, -1), (0.3, 1.2), close: true)',
		'content((-1.5, -1), [$A$], anchor: "north-east", padding: 0.1)',
		'content((1.5, -1), [$B$], anchor: "north-west", padding: 0.1)',
		'content((0.3, 1.2), [$C$], anchor: "south", padding: 0.1)'
	]),
	math('unit-circle', 'Unit circle', [
		`line((-1.8, 0), (1.8, 0), ${ARROW})`,
		'content((1.8, 0), [$x$], anchor: "west", padding: 0.1)',
		`line((0, -1.8), (0, 1.8), ${ARROW})`,
		'content((0, 1.8), [$y$], anchor: "south", padding: 0.1)',
		'circle((0, 0), radius: 1.4)',
		'line((0, 0), (1.07, 0.9), stroke: 2pt)',
		'content((1.07, 0.9), [$P$], anchor: "south-west", padding: 0.1)'
	]),
	math('number-line', 'Number line', [
		`line((-2.5, 0), (2.5, 0), ${ARROW})`,
		...[-2, -1, 0, 1, 2].flatMap((n) => [
			`line((${n}, 0.1), (${n}, -0.1))`,
			`content((${n}, -0.1), [$${n}$], anchor: "north", padding: 0.1)`
		])
	]),
	math('coordinate-plane', 'Coordinate plane', ['grid((-2, -1.5), (2, 1.5), step: 0.5, stroke: 0.5pt + gray.lighten(40%))', ...AXES]),
	math('sine-graph', 'Sine graph', [...AXES, `catmull(${SINE.join(', ')}, stroke: 2pt + blue)`]),
	math('tangent', 'Tangent line', [
		'bezier((-1.6, 0.78), (1.6, 0.78), (0, -1.78), stroke: 2pt)',
		'line((-0.4, -1.14), (2, 0.78), stroke: red)',
		`circle((0.8, -0.18), radius: 0.05, ${DOT})`
	]),
	math('circle-radius', 'Circle with radius', [
		'circle((0, 0), radius: 1.4)',
		`circle((0, 0), radius: 0.05, ${DOT})`,
		'line((0, 0), (1.4, 0))',
		'content((0.7, 0), [$r$], anchor: "south", padding: 0.1)'
	]),
	math('right-triangle', 'Right triangle', [
		'line((-1.5, -1), (1.5, -1), (1.5, 1), close: true)',
		'line((1.2, -1), (1.2, -0.7), (1.5, -0.7))',
		'content((0, -1), [$a$], anchor: "north", padding: 0.1)',
		'content((1.5, 0), [$b$], anchor: "west", padding: 0.1)',
		'content((0, 0), [$c$], anchor: "south-east", padding: 0.1)'
	]),
	math('parallel-lines', 'Parallel lines', ['line((-2, 0.5), (2, 0.5))', 'line((-2, -0.5), (2, -0.5))', 'line((-1, -1.2), (1, 1.2))']),
	math('vector-sum', 'Vector sum', [
		'line((-1.4, -1), (0.6, -0.5), stroke: 2pt, mark: (end: "stealth", fill: black))',
		'content((-0.4, -0.75), [$arrow(a)$], anchor: "north", padding: 0.1)',
		'line((-1.4, -1), (-0.6, 0.5), stroke: 2pt, mark: (end: "stealth", fill: black))',
		'content((-1, -0.25), [$arrow(b)$], anchor: "east", padding: 0.1)',
		'line((0.6, -0.5), (1.4, 1), (-0.6, 0.5), stroke: (dash: "dashed"))',
		'line((-1.4, -1), (1.4, 1), stroke: 2pt + blue, mark: (end: "stealth", fill: blue))',
		'content((0, 0), text(fill: blue)[$arrow(a) + arrow(b)$], anchor: "south-east", padding: 0.1)'
	]),
	math('ellipse-foci', 'Ellipse with foci', [
		'circle((0, 0), radius: (2, 1.2))',
		`circle((-1.6, 0), radius: 0.05, ${DOT})`,
		'content((-1.6, 0), [$F_1$], anchor: "north", padding: 0.1)',
		`circle((1.6, 0), radius: 0.05, ${DOT})`,
		'content((1.6, 0), [$F_2$], anchor: "north", padding: 0.1)'
	])
];

export const PHYSICS = [
	element(
		'Physics',
		'inclined-plane',
		'Inclined plane',
		grouped([
			'line((-2, -1), (2, -1), (2, 1), close: true)',
			'scope({ rotate(26.57deg); rect((-0.4, 0), (0.4, 0.6), fill: gray.lighten(40%)) })',
			`line((-0.13, 0.27), (-0.13, -0.6), stroke: 2pt, ${ARROW})`,
			'content((-0.13, -0.6), [$m g$], anchor: "north", padding: 0.1)',
			'arc((-1.2, -1), start: 0deg, stop: 26.57deg, radius: 0.8)',
			'content((-1.22, -0.82), [$theta$], anchor: "west", padding: 0.1)'
		])
	),
	element(
		'Physics',
		'pendulum',
		'Pendulum',
		grouped([
			'line((-1, 1.5), (1, 1.5), stroke: 2pt)',
			'line((0, 1.5), (0, -0.8), stroke: (dash: "dashed"))',
			'line((0, 1.5), (1, -0.5))',
			'circle((1, -0.5), radius: 0.25, fill: gray)',
			'arc((0, 0.9), start: -90deg, stop: -63.43deg, radius: 0.6)',
			'content((0.14, 0.92), [$theta$], anchor: "north", padding: 0.1)'
		])
	),
	element(
		'Physics',
		'forces',
		'Forces on a block',
		grouped([
			'rect((-0.6, -0.4), (0.6, 0.4), fill: gray.lighten(40%))',
			`line((0, 0.4), (0, 1.3), stroke: 2pt, ${ARROW})`,
			'content((0, 1.3), [$N$], anchor: "south", padding: 0.1)',
			`line((0, -0.4), (0, -1.3), stroke: 2pt, ${ARROW})`,
			'content((0, -1.3), [$m g$], anchor: "north", padding: 0.1)',
			`line((0.6, 0), (1.6, 0), stroke: 2pt, ${ARROW})`,
			'content((1.6, 0), [$F$], anchor: "west", padding: 0.1)',
			`line((-0.6, 0), (-1.4, 0), stroke: 2pt, ${ARROW})`,
			'content((-1.4, 0), [$f$], anchor: "east", padding: 0.1)'
		])
	)
];
