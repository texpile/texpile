import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../../engines/lualatexEngine';
import type { FigureDimension } from '$lib/draw/editor/figure/figureLanguage';
import { addDimension, readDimension, relabelDimension } from '$lib/draw/tikz/source/dimensions/dimensionStatements';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}
  \draw (1,1) -- (5,2) -- (5,4);
  \node[draw, minimum width=2cm, minimum height=1cm] at (2,4) {};
  \draw (8,3) circle[radius=1];
\end{tikzpicture}`;

function written(d: FigureDimension, source = SRC) {
	const next = addDimension(source, 0, d)!;
	const picture = readPicture(next)!;
	return { next, read: readDimension(next, picture, picture.statements.at(-1)!) };
}

describe('dimensions written into the figure', () => {
	it('names what they measure, defines their style once, and read back as written', () => {
		const length: FigureDimension = { kind: 'aligned', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 1 }, offset: 0.6 };
		const { next, read } = written(length);
		expect(next).toContain('\\draw (1,1) coordinate (D1) -- (5,2) coordinate (D2) -- (5,4);');
		expect(next).toContain('\\begin{tikzpicture}[dimension/.style=');
		expect(read).toEqual(length);
		for (const d of [
			{ kind: 'y', from: { stmt: 1, k: 1 }, to: { stmt: 1, k: 2 }, offset: 0.7 },
			{ kind: 'node', stmt: 2, axis: 'x', side: 1, offset: 0.4 },
			{ kind: 'radius', center: { stmt: 3, k: 0 }, length: 1, value: 1, angle: 45 }
		] as FigureDimension[]) {
			const again = written(d, next);
			expect(again.read).toEqual(d);
			expect(again.next.match(/dimension\/\.style/g)).toHaveLength(1);
		}
	});

	it('reads an angle back by the ways it runs, at the corner the lines share', () => {
		const angle: FigureDimension = {
			kind: 'angle',
			lines: [
				[
					{ stmt: 1, k: 0 },
					{ stmt: 1, k: 1 }
				],
				[
					{ stmt: 1, k: 1 },
					{ stmt: 1, k: 2 }
				]
			],
			rays: [-1, 1],
			radius: 0.8
		};
		const { next, read } = written(angle);
		expect(next).toContain('\\p0 = (D2)');
		expect(read).toEqual({ ...angle, lines: [[angle.lines[0][1], angle.lines[0][0]], angle.lines[1]], rays: [1, 1] });
	});
});

describe('a dimension that prints a name', () => {
	it('prints it in place of what it measures, reads it back, and measures again without it', () => {
		const angle: FigureDimension = {
			kind: 'angle',
			lines: [
				[
					{ stmt: 1, k: 1 },
					{ stmt: 1, k: 0 }
				],
				[
					{ stmt: 1, k: 1 },
					{ stmt: 1, k: 2 }
				]
			],
			rays: [1, 1],
			radius: 0.8
		};
		for (const d of [
			{ kind: 'aligned', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 1 }, offset: 0.6 },
			{ kind: 'node', stmt: 2, axis: 'x', side: 1, offset: 0.4 },
			{ kind: 'radius', center: { stmt: 3, k: 0 }, length: 1, value: 1, angle: 45 },
			angle
		] as FigureDimension[]) {
			const measured = written(d).next;
			const named = written({ ...d, label: '$a_1$ 50%' });
			expect(named.next).toContain('{$a_1$ 50\\%}');
			expect(named.read?.label).toBe('$a_1$ 50%');
			const picture = readPicture(named.next)!;
			const again = relabelDimension(named.next, 0, picture.statements.at(-1)!.i, null);
			expect(again).toBe(measured);
		}
	});
});

describe.skipIf(!hasLualatex)('dimensions drawn', () => {
	useLualatex();

	it('draws every kind with no error from TeX', async () => {
		let source = SRC;
		for (const d of [
			{ kind: 'aligned', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 1 }, offset: 0.6 },
			{ kind: 'x', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 2 }, offset: -0.6 },
			{ kind: 'node', stmt: 2, axis: 'y', side: -1, offset: -0.4 },
			{ kind: 'radius', center: { stmt: 3, k: 0 }, length: 1, value: 1, angle: 45 },
			{
				kind: 'angle',
				lines: [
					[
						{ stmt: 1, k: 1 },
						{ stmt: 1, k: 0 }
					],
					[
						{ stmt: 1, k: 1 },
						{ stmt: 1, k: 2 }
					]
				],
				rays: [1, 1],
				radius: 0.8
			}
		] as FigureDimension[])
			source = addDimension(source, 0, d)!;
		const doc = `\\documentclass{article}\n\\begin{document}\n${source}\n\\end{document}\n`;
		const result = await drawWithLualatex(
			'\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{calc}',
			instrumentPicture(doc, readPicture(doc)!)
		);
		expect(result.errors).toEqual([]);
	});

	it('measures a round node across the box around it, not between its corner anchors on the outline', async () => {
		const round = '\\begin{tikzpicture}\n  \\node[draw, ellipse, minimum width=4cm, minimum height=5cm] at (0,0) {};\n\\end{tikzpicture}';
		const doc = `\\documentclass{article}\n\\begin{document}\n${addDimension(round, 0, { kind: 'node', stmt: 1, axis: 'x', side: -1, offset: -0.5 })}\n\\end{document}\n`;
		const result = await drawWithLualatex(
			'\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{calc,shapes.geometric}',
			instrumentPicture(doc, readPicture(doc)!)
		);
		expect(result.errors).toEqual([]);
		function xs(stmt: number) {
			const parts = buildDrawing(result).parts.filter((p) => p.stmt === stmt && p.kind === 'path');
			const all = parts.flatMap((p) =>
				p.kind === 'path' ? (p.d.match(/-?\d*\.?\d+/g) ?? []).map(Number).filter((_, k) => k % 2 === 0) : []
			);
			return [Math.min(...all), Math.max(...all)];
		}
		const [[n1, n2], [d1, d2]] = [xs(1), xs(2)];
		expect(Math.abs(d1 - n1)).toBeLessThan(1);
		expect(Math.abs(d2 - n2)).toBeLessThan(1);
	});

	it('prints a length on the paper, whatever the picture is scaled by', async () => {
		const scaled = '\\begin{tikzpicture}[scale=2]\n  \\draw (0,0) -- (1.5,0) -- (1.5,1);\n\\end{tikzpicture}';
		let source = scaled;
		for (const d of [
			{ kind: 'aligned', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 1 }, offset: 0.5 },
			{ kind: 'x', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 2 }, offset: -0.5 }
		] as FigureDimension[])
			source = addDimension(source, 0, d)!;
		// each value TeX prints, told as an error so it can be read back
		const told = source.replace(/\\pgfmathprintnumber\[[^\]]*\]\{\\pgfmathresult\}/g, '\\errmessage{printed \\pgfmathresult}');
		const doc = `\\documentclass{article}\n\\begin{document}\n${told}\n\\end{document}\n`;
		const result = await drawWithLualatex(
			'\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{calc}',
			instrumentPicture(doc, readPicture(doc)!)
		);
		const printed = result.errors.map((e) => Number(/printed (-?\d*\.?\d+)/.exec(e)?.[1]));
		expect(printed).toHaveLength(2);
		for (const v of printed) expect(v).toBeCloseTo(3, 2);
	});

	it('brings a dimension style written by an earlier version up to date, so a new dimension typesets', async () => {
		const earlier =
			'\\begin{tikzpicture}[dimension/.style={thin, gray, >=latex, every node/.style={fill=white, inner sep=1pt, font=\\footnotesize}}]\n' +
			'  \\draw (0,0) -- (2,0);\n\\end{tikzpicture}';
		const source = addDimension(earlier, 0, { kind: 'aligned', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 1 }, offset: 0.5 })!;
		expect(source.match(/dimension\/\.style/g)).toHaveLength(1);
		const doc = `\\documentclass{article}\n\\begin{document}\n${source}\n\\end{document}\n`;
		const result = await drawWithLualatex(
			'\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{calc}',
			instrumentPicture(doc, readPicture(doc)!)
		);
		expect(result.errors).toEqual([]);
	});

	it('keeps the color it was given when it is named', () => {
		const line = '\\begin{tikzpicture}\n  \\draw (0,0) -- (2,0);\n\\end{tikzpicture}';
		const once = addDimension(line, 0, { kind: 'aligned', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 1 }, offset: 0.5 })!;
		const red = once.replace('\\draw[dimension]', '\\draw[dimension, red]');
		expect(relabelDimension(red, 0, 2, 'w')).toContain('\\draw[dimension, red] let');
	});
});
