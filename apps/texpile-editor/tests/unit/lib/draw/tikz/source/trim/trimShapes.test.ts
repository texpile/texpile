import { describe, expect, it } from 'vitest';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { trimmable, writeTrimmed } from '$lib/draw/tikz/source/trim/trimShapes';

const picture = (body: string) => `\\begin{tikzpicture}\n  ${body}\n\\end{tikzpicture}`;
const first = (source: string) => readPicture(source)!.statements[0];

describe('shapes to trim', () => {
	it('reads lines, boxes, circles and outline-only round nodes, and leaves the rest alone', () => {
		const shapes = [
			'\\draw[->, red] (0,0) -- (2,0) -- ++(0,1);',
			'\\draw (0,0) -- (2,0) -- (2,1) -- cycle;',
			'\\draw (1,1) rectangle (3,2);',
			'\\draw (1,1) ellipse (2 and 1);',
			'\\node[draw, circle, minimum size=2cm] at (0,0) {};',
			'\\node[draw, circle] at (0,0) {A};',
			'\\draw (0,0) .. controls (1,1) .. (2,0);'
		].map((s) => trimmable(picture(s), first(picture(s)))?.kind ?? null);
		expect(shapes).toEqual(['polyline', 'polyline', 'polyline', 'ellipse', 'node', 'node', null]);
		const lines = picture('\\draw (0,0) -- (2,0) -- ++(0,1);');
		expect(trimmable(lines, first(lines))).toEqual({
			kind: 'polyline',
			runs: [
				{
					points: [
						[0, 0],
						[2, 0],
						[2, 1]
					],
					closed: false
				}
			]
		});
		// a rectangle is its four corners, and a path cut before is its runs, a name left on its own drawing nothing
		const cut = picture('\\draw (0,0) rectangle (2,1) (3,0) coordinate (D1) -- (4,0) (5,5) coordinate (D2);');
		expect(trimmable(cut, first(cut))).toEqual({
			kind: 'polyline',
			runs: [
				{
					points: [
						[0, 0],
						[2, 0],
						[2, 1],
						[0, 1]
					],
					closed: true
				},
				{
					points: [
						[3, 0],
						[4, 0]
					],
					closed: false
				}
			]
		});
	});

	it('reads the arcs a trim leaves as the ellipse they are of', () => {
		const arcs = picture(
			'\\draw (3,1) arc[start angle=0, end angle=90, x radius=2, y radius=1] (-1,1) arc[start angle=180, end angle=270, x radius=2, y radius=1] (1,1) coordinate (D1);'
		);
		expect(trimmable(arcs, first(arcs))).toEqual({
			kind: 'ellipse',
			center: [1, 1],
			rx: 2,
			ry: 1,
			spans: [
				[0, 90],
				[180, 270]
			]
		});
	});

	it('writes what is left with the style it had; a node outline as a path', () => {
		const lines = picture('\\draw[->, red] (0,0) -- (4,0);');
		expect(
			writeTrimmed(lines, first(lines), {
				kind: 'polyline',
				runs: [
					{
						points: [
							[0, 0],
							[1, 0]
						],
						closed: false
					},
					{
						points: [
							[3, 0],
							[4, 0]
						],
						closed: false
					}
				]
			})
		).toBe(picture('\\draw[->, red] (0,0) -- (1,0) (3,0) -- (4,0);'));
		const node = picture('\\node[draw=blue, thick, ellipse, minimum width=4cm] at (1,1) {};');
		expect(writeTrimmed(node, first(node), { kind: 'arcs', center: [1, 1], rx: 2, ry: 1, spans: [[0, 180]] })).toBe(
			picture('\\draw[blue, thick] (3,1) arc[start angle=0, end angle=180, x radius=2, y radius=1];')
		);
	});

	it('keeps an arrow tip only where its end is still drawn', () => {
		const arrow = picture('\\draw[<->, thick] (0,0) -- (4,0);');
		const keep = (points: [number, number][]) => writeTrimmed(arrow, first(arrow), { kind: 'polyline', runs: [{ points, closed: false }] });
		expect(
			keep([
				[0, 0],
				[1, 0]
			])
		).toBe(picture('\\draw[<-, thick] (0,0) -- (1,0);'));
		expect(
			keep([
				[3, 0],
				[4, 0]
			])
		).toBe(picture('\\draw[->, thick] (3,0) -- (4,0);'));
	});

	it('keeps the names dimensions measure: a path point by its name, a node with its name and text but no outline', () => {
		const named = picture('\\draw (0,0) coordinate (D1) -- (4,0) coordinate (D2);');
		expect(
			writeTrimmed(named, first(named), {
				kind: 'polyline',
				runs: [
					{
						points: [
							[0, 0],
							[1, 0]
						],
						closed: false
					}
				]
			})
		).toBe(picture('\\draw (0,0) coordinate (D1) -- (1,0) (4,0) coordinate (D2);'));
		const node = picture('\\node[draw, ellipse, minimum width=4cm] (n2) at (0,0) {};\n  \\draw (n2.south) -- (0,-3);');
		expect(writeTrimmed(node, first(node), { kind: 'arcs', center: [0, 0], rx: 2, ry: 1, spans: [[0, 180]] })).toBe(
			picture(
				'\\node[ellipse, minimum width=4cm] (n2) at (0,0) {};\n  \\draw (2,0) arc[start angle=0, end angle=180, x radius=2, y radius=1];\n  \\draw (n2.south) -- (0,-3);'
			)
		);
		const text = picture('\\node[draw] at (0,0) {A};');
		expect(
			writeTrimmed(text, first(text), {
				kind: 'polyline',
				runs: [
					{
						points: [
							[0, 0],
							[1, 0]
						],
						closed: false
					}
				]
			})
		).toBe(picture('\\node at (0,0) {A};\n  \\draw (0,0) -- (1,0);'));
	});
});
