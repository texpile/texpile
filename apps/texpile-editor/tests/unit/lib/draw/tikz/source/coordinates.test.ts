import { describe, expect, it } from 'vitest';
import { absolutePoints, movePoint, pathPoints, radii, shiftPoints, stretchPoints } from '$lib/draw/tikz/source/coordinates';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { sourceDelta } from '$lib/draw/editor/figure/geometry';
import { pgfTransform } from '$lib/draw/tikz/renderTikz';

const SRC = String.raw`\begin{tikzpicture}[scale=2]
  \draw[thick, blue] (2,2) rectangle (6,5);
  \node (a) [draw] at (10,7) {$x$};
  \begin{scope}[shift={(1,0)}]
    \draw (0,0) -- ++(1,0) -- (a);
  \end{scope}
\end{tikzpicture}
`;

describe('moving', () => {
	it('shifts plain points only, never relative, named or option coordinates', () => {
		const pic = readPicture(SRC)!;
		const inner = pic.statements[3];
		expect(absolutePoints(SRC, inner).map((p) => [p.x, p.y])).toEqual([[0, 0]]);
		const moved = shiftPoints(SRC, absolutePoints(SRC, pic.statements[0]), 0.5, -1);
		expect(moved).toContain('\\draw[thick, blue] (2.5,1) rectangle (6.5,4);');
		expect(moved).toContain('[shift={(1,0)}]');
	});

	it('undoes the statement transform when turning a drag into source units', () => {
		const [du, dv] = sourceDelta(72 / 2.54, 0, pgfTransform([2, 0, 0, 2, 0, 0, 28.45274, 0, 0, 28.45274]));
		expect(du).toBeCloseTo(0.5, 4);
		expect(dv).toBeCloseTo(0, 6);
	});
});

describe('stretching', () => {
	it('scales points away from the anchor, relative offsets and radii with them', () => {
		const src = '\\begin{tikzpicture}\n  \\draw (0,0) -- ++(2,1) -- (4,0) ellipse [x radius=1, y radius=0.5];\n\\end{tikzpicture}';
		const st = readPicture(src)!.statements[0];
		const out = stretchPoints(src, pathPoints(src, st), radii(src, st), [0, 0], 1.5, 2);
		expect(out).toContain('\\draw (0,0) -- ++(3,2) -- (6,0) ellipse [x radius=1.5, y radius=1];');
	});
});

describe('radii', () => {
	it('finds circle and ellipse radii in both syntaxes, with their centers', () => {
		const src =
			'\\begin{tikzpicture}\n  \\draw (1,2) circle [radius=1.5] (4,0) ellipse (2cm and 1cm);\n  \\fill (0,0) circle (0.12);\n\\end{tikzpicture}';
		const pic = readPicture(src)!;
		expect(radii(src, pic.statements[0]).map((r) => [r.axis, r.value, r.center.x, src.slice(r.from, r.to)])).toEqual([
			['r', 1.5, 1, '1.5'],
			['x', 2, 4, '2'],
			['y', 1, 4, '1']
		]);
		expect(radii(src, pic.statements[1]).map((r) => r.value)).toEqual([0.12]);
	});
});

describe('relative and polar points', () => {
	const pic = (body: string) => `\\begin{tikzpicture}\n  ${body}\n\\end{tikzpicture}`;
	const first = (src: string) => readPicture(src)!.statements[0];

	it('places relative and polar points from the current point', () => {
		const src = pic('\\draw (1,1) -- ++(2,0) -- +(90:1) -- ++(0,3) -- (30:2);');
		const pts = pathPoints(src, first(src));
		expect(pts.map((p) => [p.relative, +p.x.toFixed(3), +p.y.toFixed(3)])).toEqual([
			['', 1, 1],
			['++', 3, 1],
			['+', 3, 2],
			['++', 3, 4],
			['', 1.732, 1]
		]);
		// the + point and the next ++ point are written from the first ++ point
		expect(pts[1].followers).toEqual([2, 3]);
		expect(pts[2].followers).toEqual([]);
	});

	it('moves one vertex and rewrites the points written from it to stay put', () => {
		const src = pic('\\draw (0,0) -- ++(2,0) -- ++(0,2) -- +(1,1);');
		const pts = pathPoints(src, first(src));
		expect(movePoint(src, pts, 1, [3, 1])).toBe(pic('\\draw (0,0) -- ++(3,1) -- ++(-1,1) -- +(1,1);'));
		// moving the first point keeps the second where it was
		expect(movePoint(src, pts, 0, [1, 0])).toBe(pic('\\draw (1,0) -- ++(1,0) -- ++(0,2) -- +(1,1);'));
	});

	it('keeps a polar point polar', () => {
		const src = pic('\\draw (0,0) -- ++(0:2) -- (45:1);');
		const pts = pathPoints(src, first(src));
		expect(movePoint(src, pts, 1, [0, 2])).toBe(pic('\\draw (0,0) -- ++(90:2) -- (45:1);'));
	});

	it('leaves alone what follows a point it cannot place', () => {
		const src = pic('\\draw (a) -- ++(1,0) -- (2,2) arc (0:90:1) -- ++(1,1) .. controls +(1,0) and (4,4) .. (5,5) circle (1);');
		const pts = pathPoints(src, first(src));
		expect(pts.map((p) => src.slice(p.from, p.to))).toEqual(['(2,2)', '(4,4)', '(5,5)']);
		expect(pts[0].followers).toEqual([]);
	});

	it('moves a statement with relative and polar points as one', () => {
		const src = pic('\\draw (30:2) -- ++(1,0);');
		expect(shiftPoints(src, absolutePoints(src, first(src)), 0, 1)).toMatch(/\(\d+(\.\d+)?:\d+(\.\d+)?\) -- \+\+\(1,0\)/);
	});
});
