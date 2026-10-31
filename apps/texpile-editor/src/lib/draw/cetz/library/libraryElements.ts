import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';
import { element } from './libraryElement';
import { MATH, PHYSICS } from './mathElements';
import { MECHANICS } from './mechanicsElements';
import { LINES, SHAPES } from './shapeElements';
import { grouped } from './shapeOutlines';
import { SOLIDS } from './solids';

const CETZ_PLOT = '#import "@preview/cetz-plot:0.1.3": plot, chart';

function diagram(id: string, name: string, statements: string[]) {
	return element('Diagrams', id, name, grouped(statements));
}

function plot(id: string, name: string, body: string) {
	// centered on where it is put, as a plot's own origin is its lower left corner
	return element('Plots', id, name, grouped(['translate((-2.5, -1.75))', body]), [], CETZ_PLOT);
}

const DIAGRAMS = [
	diagram('venn-2', 'Venn, two sets', [
		'circle((-0.6, 0), radius: 1.2, fill: red.transparentize(80%))',
		'circle((0.6, 0), radius: 1.2, fill: blue.transparentize(80%))',
		'content((-1.2, 0), [$A$])',
		'content((1.2, 0), [$B$])'
	]),
	diagram('venn-3', 'Venn, three sets', [
		'circle((-0.6, 0.4), radius: 1.1, fill: red.transparentize(80%))',
		'circle((0.6, 0.4), radius: 1.1, fill: blue.transparentize(80%))',
		'circle((0, -0.6), radius: 1.1, fill: green.transparentize(80%))',
		'content((-1.1, 0.8), [$A$])',
		'content((1.1, 0.8), [$B$])',
		'content((0, -1.2), [$C$])'
	]),
	diagram('timeline', 'Timeline', [
		'line((-2.5, 0), (2.5, 0), stroke: 2pt, mark: (end: "straight"))',
		...[
			[-2, 2020],
			[0, 2022],
			[2, 2024]
		].flatMap(([x, year]) => [`line((${x}, 0.1), (${x}, -0.1))`, `content((${x}, -0.1), [${year}], anchor: "north", padding: 0.1)`])
	]),
	diagram('cycle', 'Cycle', [
		'arc((-0.44, 1.22), start: 110deg, stop: 190deg, radius: 1.3, stroke: 2pt, mark: (end: "straight"))',
		'arc((-0.84, -1), start: 230deg, stop: 310deg, radius: 1.3, stroke: 2pt, mark: (end: "straight"))',
		'arc((1.28, -0.23), start: 350deg, stop: 430deg, radius: 1.3, stroke: 2pt, mark: (end: "straight"))',
		'circle((0, 1.3), radius: 0.25, fill: white, name: "step1"); content("step1", [1])',
		'circle((-1.13, -0.65), radius: 0.25, fill: white, name: "step2"); content("step2", [2])',
		'circle((1.13, -0.65), radius: 0.25, fill: white, name: "step3"); content("step3", [3])'
	])
];

const PLOTS = [
	plot(
		'line-plot',
		'Line plot',
		'plot.plot(size: (5, 3.5), x-tick-step: 1, y-tick-step: 2, x-label: $x$, y-label: $y$, { plot.add(domain: (-2, 2), samples: 50, x => x * x * x - 2 * x, style: (stroke: 2pt + blue)) })'
	),
	plot(
		'scatter-plot',
		'Scatter plot',
		'plot.plot(size: (5, 3.5), x-tick-step: 1, y-tick-step: 1, x-min: 0.5, x-max: 5.5, y-min: 1.5, y-max: 6.5, x-label: $x$, y-label: $y$, { plot.add(((1, 2), (2, 3.1), (3, 3.8), (4, 5.2), (5, 5.9)), mark: "o", mark-size: 0.1, mark-style: (fill: black, stroke: none), style: (stroke: none)) })'
	),
	plot(
		'bar-chart',
		'Bar chart',
		'chart.columnchart((([A], 3), ([B], 5), ([C], 2), ([D], 4)), size: (5, 3.5), y-tick-step: 1, bar-style: (fill: blue.lighten(80%), stroke: blue))'
	)
];

/** what the library adds, by group, each written around the origin */
export const LIBRARY_ELEMENTS: LibraryElement[] = [
	...SHAPES,
	...LINES,
	...MATH,
	...PHYSICS,
	...MECHANICS,
	...DIAGRAMS,
	...SOLIDS,
	...PLOTS
];
