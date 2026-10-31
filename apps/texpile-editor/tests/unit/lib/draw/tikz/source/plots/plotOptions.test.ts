import { describe, expect, it } from 'vitest';
import { movePoint, pathPoints } from '$lib/draw/tikz/source/coordinates';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { addPlot, readAxis, readPlot, writeAxis, writePlot } from '$lib/draw/tikz/source/plots/plotOptions';

const SRC = String.raw`\begin{tikzpicture}
  \begin{axis}[xlabel={$x$}, xmin=-2, xmax=2, width=8cm, at={(1cm,2cm)}]
    \addplot[blue, domain=-2:2, samples=50] {x^2};
    \addplot coordinates {(0,1) (1,2) (2,0.5)};
  \end{axis}
  \draw (0,0) -- (1,1);
\end{tikzpicture}`;

const pic = (s: string) => readPicture(s)!;
const st = (s: string, i: number) => pic(s).statements.find((x) => x.i === i)!;

describe('reading an axis', () => {
	it('reads the axis and each plot as statements, and the TikZ after it as before', () => {
		expect(pic(SRC).statements.map((s) => [s.i, s.kind])).toEqual([
			[1, 'axis'],
			[2, 'plot'],
			[3, 'plot'],
			[4, 'path']
		]);
		expect(SRC.slice(st(SRC, 4).from, st(SRC, 4).to)).toBe('\\draw (0,0) -- (1,1);');
	});

	it('marks each plot as pgfplots draws it, keeping an option-less plot on its cycle of styles', () => {
		const sent = instrumentPicture(SRC, pic(SRC));
		expect(sent).toContain('\\tikzcapmark{1}\\begin{axis}');
		expect(sent).toContain(
			'\\addplot[execute at begin plot visualization={\\tikzcapplot{2}}, execute at end plot visualization={\\tikzcapmark{1}}, blue,'
		);
		expect(sent).toContain('\\addplot+[execute at begin plot visualization={\\tikzcapplot{3}}');
		expect(sent).toContain('\\providecommand\\tikzcapplot');
	});

	it('gives a plot its data points and the axis its place to move by', () => {
		expect(pathPoints(SRC, st(SRC, 3)).map((p) => [p.x, p.y])).toEqual([
			[0, 1],
			[1, 2],
			[2, 0.5]
		]);
		expect(pathPoints(SRC, st(SRC, 1)).map((p) => [p.x, p.y])).toEqual([[1, 2]]);
		const moved = movePoint(SRC, pathPoints(SRC, st(SRC, 1)), 0, [3, 1.5]);
		expect(moved).toContain('at={(3cm,1.5cm)}');
		// a bare number there is in the axis' own units, so the canvas has no place to move it by
		const bare = SRC.replace('(1cm,2cm)', '(1,2)');
		expect(pathPoints(bare, st(bare, 1))).toEqual([]);
	});
});

describe('editing an axis and its plots', () => {
	it('reads and writes the axis options', () => {
		expect(readAxis(SRC, st(SRC, 1))).toMatchObject({ xlabel: '$x$', x: [-2, 2], y: [null, null], width: 8, grid: 'none', lines: 'box' });
		const next = writeAxis(SRC, st(SRC, 1), { ylabel: '$f(x)$', y: [0, 4], grid: 'major', lines: 'left', x: [null, null] })!;
		expect(next).toContain(
			'\\begin{axis}[xlabel={$x$}, width=8cm, at={(1cm,2cm)}, ylabel={$f(x)$}, ymin=0, ymax=4, grid=major, axis lines=left]'
		);
	});

	it('reads and writes a function plot and a data plot', () => {
		expect(readPlot(SRC, st(SRC, 2))).toEqual({ expression: 'x^2', domain: [-2, 2], color: 'blue', mark: 'none', line: 'solid' });
		const fn = writePlot(SRC, st(SRC, 2), { expression: 'sin(deg(x))', domain: [0, 6], color: 'red', line: 'dashed' })!;
		expect(fn).toContain('\\addplot[samples=50, domain=0:6, red, dashed] {sin(deg(x))};');
		expect(writePlot(SRC, st(SRC, 3), { mark: 'o', line: 'only marks' })).toContain('\\addplot[mark=o, only marks] coordinates');
	});

	it('adds a plot last in the axis', () => {
		const added = addPlot(SRC, st(SRC, 1), 'points')!;
		expect(added).toContain('(2,0.5)};\n    \\addplot[blue, mark=*] coordinates {(-1,0.5) (0,1) (1,2)};\n  \\end{axis}');
	});
});
