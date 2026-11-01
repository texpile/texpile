import type { Point } from '$lib/draw/editor/figure/geometry';
import { element } from './libraryElement';
import { closedLine, cloudPuffs, grouped, regularPolygon, starPoints, starburstPoints } from './shapeOutlines';

function outline(id: string, name: string, points: Point[]) {
	return element('Shapes', id, name, closedLine(points));
}
function line(id: string, name: string, text: string, libraries: string[] = []) {
	return element('Lines', id, name, text, libraries);
}

// a parallelogram's and a trapezoid's sides lean at 60 degrees, as TikZ's trapezium's
const LEAN = 1.2 / Math.tan(Math.PI / 3);

export const SHAPES = [
	outline('triangle', 'Triangle', regularPolygon(3, 1.25, 90)),
	outline('pentagon', 'Pentagon', regularPolygon(5, 1.25, 90)),
	outline('hexagon', 'Hexagon', regularPolygon(6, 1.25, 0)),
	outline('star', 'Star', starPoints(5, 1.25, 1.25 / 2.2)),
	element('Shapes', 'cloud', 'Cloud', grouped(cloudPuffs(10, 1.22, 0.56, 135))),
	outline('block-arrow', 'Block arrow', [
		[-1.25, -0.26],
		[0.65, -0.26],
		[0.65, -0.6],
		[1.25, 0],
		[0.65, 0.6],
		[0.65, 0.26],
		[-1.25, 0.26]
	]),
	outline('double-block-arrow', 'Double block arrow', [
		[-1.25, 0],
		[-0.65, -0.6],
		[-0.65, -0.26],
		[0.65, -0.26],
		[0.65, -0.6],
		[1.25, 0],
		[0.65, 0.6],
		[0.65, 0.26],
		[-0.65, 0.26],
		[-0.65, 0.6]
	]),
	element(
		'Shapes',
		'callout',
		'Speech bubble',
		'line((-1.25, -0.5), (0.2, -0.5), (0.65, -1.2), (0.5, -0.5), (1.25, -0.5), (1.25, 0.5), (-1.25, 0.5), close: true, name: "bubble"); content("bubble", [Text])'
	),
	outline('octagon', 'Octagon', regularPolygon(8, 1.25, 22.5)),
	outline('isosceles-triangle', 'Isosceles triangle', [
		[0, 1.1],
		[-1, -1.1],
		[1, -1.1]
	]),
	outline('parallelogram', 'Parallelogram', [
		[-1.25, -0.6],
		[1.25 - LEAN, -0.6],
		[1.25, 0.6],
		[LEAN - 1.25, 0.6]
	]),
	outline('trapezoid', 'Trapezoid', [
		[-1.25, -0.6],
		[1.25, -0.6],
		[1.25 - LEAN, 0.6],
		[LEAN - 1.25, 0.6]
	]),
	element('Shapes', 'semicircle', 'Semicircle', 'arc((1.25, -0.63), start: 0deg, stop: 180deg, radius: 1.25, mode: "CLOSE")'),
	element('Shapes', 'sector', 'Sector', 'arc((1.1, 0.81), start: 60deg, stop: 120deg, radius: 2.2, mode: "PIE")'),
	outline('kite', 'Kite', [
		[0, 1.2],
		[-1.04, 0.6],
		[0, -1.2],
		[1.04, 0.6]
	]),
	outline('starburst', 'Starburst', starburstPoints(1.3, 0.9, 0.38)),
	outline('signal', 'Signal', [
		[-1.25, -0.5],
		[0.75, -0.5],
		[1.25, 0],
		[0.75, 0.5],
		[-1.25, 0.5]
	]),
	element(
		'Shapes',
		'tape',
		'Tape',
		grouped([
			'bezier((-1.25, 0.6), (1.25, 0.6), (-0.4, 0.4), (0.4, 0.8))',
			'line((1.25, 0.6), (1.25, -0.6))',
			'bezier((1.25, -0.6), (-1.25, -0.6), (0.4, -0.4), (-0.4, -0.8))',
			'line((-1.25, -0.6), (-1.25, 0.6))'
		])
	),
	outline('chamfered', 'Chamfered box', [
		[-1, -0.6],
		[1, -0.6],
		[1.25, -0.35],
		[1.25, 0.35],
		[1, 0.6],
		[-1, 0.6],
		[-1.25, 0.35],
		[-1.25, -0.35]
	]),
	element('Shapes', 'no-sign', 'No sign', grouped(['circle((0, 0), radius: 1)', 'line((0.71, 0.71), (-0.71, -0.71))'])),
	element(
		'Shapes',
		'split-box',
		'Two-part box',
		grouped([
			'rect((-1.25, 0), (1.25, 0.5), name: "top"); content("top", [Top])',
			'rect((-1.25, -0.5), (1.25, 0), name: "bottom"); content("bottom", [Bottom])'
		])
	),
	element(
		'Shapes',
		'heart',
		'Heart',
		grouped(['bezier((0, -1), (0, 0.7), (-1.8, 0.3), (-0.9, 1.6))', 'bezier((0, 0.7), (0, -1), (0.9, 1.6), (1.8, 0.3))'])
	)
];

export const LINES = [
	line('double-arrow', 'Double arrow', 'line((-1.5, 0), (1.5, 0), mark: (start: "straight", end: "straight"))'),
	line(
		'dimension',
		'Dimension',
		grouped([
			'line((-1.5, 0), (1.5, 0), mark: (start: "straight", end: "straight"))',
			'line((-1.5, 0.15), (-1.5, -0.15))',
			'line((1.5, 0.15), (1.5, -0.15))',
			'content((0, 0), [$d$], anchor: "south", padding: 0.1)'
		])
	),
	line('arc', 'Arc', 'arc((1, 0), start: 0deg, stop: 270deg, radius: 1, mark: (end: "straight"))'),
	line(
		'brace',
		'Brace',
		grouped(['decorations.brace((-1.5, 0), (1.5, 0), amplitude: 0.2)', 'content((0, 0.25), [$a$], anchor: "south", padding: 0.1)']),
		['decorations']
	),
	line('spring', 'Spring', 'decorations.coil(line((-1.5, 0), (1.5, 0)), amplitude: 0.4, segment-length: 0.2)', ['decorations']),
	line('zigzag', 'Zigzag', 'decorations.zigzag(line((-1.5, 0), (1.5, 0)), amplitude: 0.3, segment-length: 0.3)', ['decorations']),
	line('wave', 'Wave', 'decorations.wave(line((-1.5, 0), (1.5, 0)), amplitude: 0.3, segment-length: 0.6)', ['decorations']),
	line('curved-arrow', 'Curved arrow', 'bezier((-1.5, 0), (1.5, 0), (-0.6, 0.75), (0.6, 0.75), mark: (end: "straight"))'),
	line('elbow-arrow', 'Elbow arrow', 'line((-1.5, -0.8), (1.5, -0.8), (1.5, 0.8), mark: (end: "straight"))'),
	line(
		'dashed-arrow',
		'Dashed arrow',
		'line((-1.5, 0), (1.5, 0), stroke: (dash: "dashed"), mark: (end: "straight", stroke: (dash: none)))'
	),
	line('bold-arrow', 'Bold arrow', 'line((-1.5, 0), (1.5, 0), stroke: 3pt, mark: (end: ">", fill: black, stroke: 1pt, scale: 2))'),
	line('double-line', 'Double line', grouped(['line((-1.5, 0.05), (1.5, 0.05))', 'line((-1.5, -0.05), (1.5, -0.05))']))
];
