import { element } from './libraryElement';
import { grouped } from './shapeOutlines';

// drawn as textbooks draw them, in an oblique view: the faces toward the viewer shaded, the hidden edges dashed over them;
// flat, as the canvas draws no gradients, and a round base filled whole first so no seam shows along its middle
function solid(id: string, name: string, statements: string[]) {
	return element('3D', id, name, grouped(statements));
}

const HIDDEN = 'stroke: (dash: "dashed")';
const [LIGHT, MID, DARK] = ['gray.lighten(70%)', 'gray.lighten(40%)', 'gray'];

export const SOLIDS = [
	solid('cube', 'Cube', [
		`line((-1.6, -1.4), (0.4, -1.4), (0.4, 0.6), (-1.6, 0.6), close: true, fill: ${LIGHT})`,
		`line((-1.6, 0.6), (0.4, 0.6), (1.6, 1.4), (-0.4, 1.4), close: true, fill: ${MID})`,
		`line((0.4, -1.4), (1.6, -0.6), (1.6, 1.4), (0.4, 0.6), close: true, fill: ${DARK})`,
		`line((-1.6, -1.4), (-0.4, -0.6), (1.6, -0.6), ${HIDDEN})`,
		`line((-0.4, -0.6), (-0.4, 1.4), ${HIDDEN})`
	]),
	solid('cuboid', 'Cuboid', [
		`line((-1.95, -1.05), (1.05, -1.05), (1.05, 0.45), (-1.95, 0.45), close: true, fill: ${LIGHT})`,
		`line((-1.95, 0.45), (1.05, 0.45), (1.95, 1.05), (-1.05, 1.05), close: true, fill: ${MID})`,
		`line((1.05, -1.05), (1.95, -0.45), (1.95, 1.05), (1.05, 0.45), close: true, fill: ${DARK})`,
		`line((-1.95, -1.05), (-1.05, -0.45), (1.95, -0.45), ${HIDDEN})`,
		`line((-1.05, -0.45), (-1.05, 1.05), ${HIDDEN})`
	]),
	solid('cylinder', 'Cylinder', [
		`circle((0, -1), radius: (1, 0.35), fill: ${MID}, stroke: none)`,
		// its top edge is under the top face
		`line((-1, -1), (-1, 1), (1, 1), (1, -1), fill: ${MID})`,
		'arc((-1, -1), start: 180deg, stop: 360deg, radius: (1, 0.35))',
		`arc((1, -1), start: 0deg, stop: 180deg, radius: (1, 0.35), ${HIDDEN})`,
		`circle((0, 1), radius: (1, 0.35), fill: ${LIGHT})`
	]),
	solid('cone', 'Cone', [
		`circle((0, -1.2), radius: (1, 0.35), fill: ${MID}, stroke: none)`,
		`line((-0.99, -1.15), (0, 1.2), (0.99, -1.15), fill: ${MID})`,
		'arc((-0.99, -1.15), start: 171.61deg, stop: 368.39deg, radius: (1, 0.35))',
		`arc((0.99, -1.15), start: 8.39deg, stop: 171.61deg, radius: (1, 0.35), ${HIDDEN})`
	]),
	solid('sphere', 'Sphere', [
		`circle((0, 0), radius: 1.2, fill: ${MID})`,
		'arc((-1.2, 0), start: 180deg, stop: 360deg, radius: (1.2, 0.35))',
		`arc((1.2, 0), start: 0deg, stop: 180deg, radius: (1.2, 0.35), ${HIDDEN})`
	]),
	solid('pyramid', 'Pyramid', [
		`line((-1.6, -1.5), (0.4, -1.5), (0, 1.1), close: true, fill: ${LIGHT})`,
		`line((0.4, -1.5), (1.6, -0.7), (0, 1.1), close: true, fill: ${DARK})`,
		`line((-1.6, -1.5), (-0.4, -0.7), (1.6, -0.7), ${HIDDEN})`,
		`line((-0.4, -0.7), (0, 1.1), ${HIDDEN})`
	]),
	solid('prism', 'Prism', [
		`line((-1.68, -1.22), (0.72, -1.22), (-0.48, 0.58), close: true, fill: ${LIGHT})`,
		`line((0.72, -1.22), (1.68, -0.58), (0.48, 1.22), (-0.48, 0.58), close: true, fill: ${DARK})`,
		`line((-1.68, -1.22), (-0.72, -0.58), (1.68, -0.58), ${HIDDEN})`,
		`line((-0.72, -0.58), (0.48, 1.22), ${HIDDEN})`
	]),
	solid('tetrahedron', 'Tetrahedron', [
		`line((-1.38, -1.22), (1.02, -1.22), (-0.02, 1.22), close: true, fill: ${LIGHT})`,
		`line((1.02, -1.22), (1.38, -0.58), (-0.02, 1.22), close: true, fill: ${DARK})`,
		`line((-1.38, -1.22), (1.38, -0.58), ${HIDDEN})`
	]),
	solid('frustum', 'Frustum', [
		`circle((0, -1), radius: (1.2, 0.4), fill: ${MID}, stroke: none)`,
		// its top edge is under the top face
		`line((-1.2, -1), (-0.6, 1), (0.6, 1), (1.2, -1), fill: ${MID})`,
		'arc((-1.2, -1), start: 180deg, stop: 360deg, radius: (1.2, 0.4))',
		`arc((1.2, -1), start: 0deg, stop: 180deg, radius: (1.2, 0.4), ${HIDDEN})`,
		`circle((0, 1), radius: (0.6, 0.2), fill: ${LIGHT})`
	]),
	solid('hemisphere', 'Hemisphere', [
		`circle((0, -0.5), radius: (1.4, 0.45), fill: ${MID}, stroke: none)`,
		`arc((-1.4, -0.5), start: 180deg, stop: 0deg, radius: 1.4, fill: ${MID})`,
		'arc((1.4, -0.5), start: 0deg, stop: -180deg, radius: (1.4, 0.45))',
		`arc((1.4, -0.5), start: 0deg, stop: 180deg, radius: (1.4, 0.45), ${HIDDEN})`
	]),
	solid('hexagonal-prism', 'Hexagonal prism', [
		`line((0.62, -0.32), (0.07, 0.63), (-1.03, 0.63), (-1.58, -0.32), (-1.03, -1.27), (0.07, -1.27), close: true, fill: ${LIGHT})`,
		`line((0.62, -0.32), (1.58, 0.32), (1.03, 1.27), (0.07, 0.63), close: true, fill: gray.lighten(35%))`,
		`line((0.07, 0.63), (1.03, 1.27), (-0.07, 1.27), (-1.03, 0.63), close: true, fill: gray.lighten(10%))`,
		`line((0.07, -1.27), (1.03, -0.63), (1.58, 0.32), (0.62, -0.32), close: true, fill: ${DARK})`,
		`line((-0.07, 1.27), (-0.62, 0.32), (-0.07, -0.63), (1.03, -0.63), ${HIDDEN})`,
		`line((-1.58, -0.32), (-0.62, 0.32), ${HIDDEN})`,
		`line((-1.03, -1.27), (-0.07, -0.63), ${HIDDEN})`
	]),
	solid('axes-3d', '3D axes', [
		'line((0, 0), (2, 0), mark: (end: "straight"))',
		'content((2, 0), [$y$], anchor: "west", padding: 0.1)',
		'line((0, 0), (0, 2), mark: (end: "straight"))',
		'content((0, 2), [$z$], anchor: "south", padding: 0.1)',
		'line((0, 0), (-1.2, -0.8), mark: (end: "straight"))',
		'content((-1.2, -0.8), [$x$], anchor: "north-east", padding: 0.1)'
	])
];
