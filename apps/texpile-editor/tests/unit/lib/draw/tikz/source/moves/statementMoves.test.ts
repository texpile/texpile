// the drawn check needs lualatex, and is skipped without it
import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../../engines/lualatexEngine';
import { statementBoxes } from '$lib/draw/editor/state/snapTargets';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { addStep } from '$lib/draw/tikz/source/moves/nextStep';
import { shiftStatement, statementMovable } from '$lib/draw/tikz/source/moves/statementMoves';
import { writeNodeBox } from '$lib/draw/tikz/source/nodes';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}[node distance=2cm]
  \coordinate (A) at (0,0);
  \coordinate (B) at (2,1);
  \node[draw] (c) at (4,0) {C};
  \node[draw, right=of c] (d) {D};
  \node[draw] (e) [below left=1cm and 2 of d] {E};
  \draw (A) -- (B) -- ++(1,0) -- cycle;
  \draw (A) -- (c.west);
  \foreach \x/\l in {1/a,2/b} { \node[draw] at (\x,3) {\l}; \foreach \y in {1,2} \fill (\x,\y) circle (1pt); }
  \node[draw] at (c.north) [anchor=south] {F};
  \draw[->] (0,-\yaxis) -- (0,\yaxis);
  \node[draw, right=0.5em of c] (g) {G};
\end{tikzpicture}`;

const pic = (s: string) => readPicture(s)!;
const st = (s: string, k: number) => pic(s).statements[k - 1];
const line = (s: string, k: number) => s.slice(st(s, k).from, st(s, k).to);
const shifted = (k: number) => line(shiftStatement(SRC, st(SRC, k), 0.5, -0.5), k);

describe('moving what is not written at a point', () => {
	it('moves a node placed beside another by its distance, a corner side by both, and across a side by a shift', () => {
		expect(shifted(4)).toBe('\\node[yshift=-0.5cm, draw, right=2.5cm of c] (d) {D};');
		expect(shifted(5)).toBe('\\node[draw] (e) [below left=1.5cm and 1.5 of d] {E};');
	});

	it('moves a loop by a shift first in what it draws, and a path by the coordinates it is drawn through', () => {
		expect(shifted(8)).toBe(
			'\\foreach \\x/\\l in {1/a,2/b} { \\node[xshift=0.5cm, yshift=-0.5cm, draw] at (\\x,3) {\\l}; \\foreach \\y in {1,2} \\fill[shift={(0.5,-0.5)}] (\\x,\\y) circle (1pt); }'
		);
		const named = (k: number) => st(SRC, k);
		expect(statementMovable(SRC, named(6))).toBe(true);
		// a path to a node would leave the node behind
		expect(statementMovable(SRC, named(7))).toBe(false);
	});

	it('moves a node at a name by its own shifts, a path written with macros by a shift first in its options; an em as the font sets it', () => {
		expect(shifted(9)).toBe('\\node[xshift=0.5cm, yshift=-0.5cm, draw] at (c.north) [anchor=south] {F};');
		expect(shifted(10)).toBe('\\draw[shift={(0.5,-0.5)}, ->] (0,-\\yaxis) -- (0,\\yaxis);');
		expect(shifted(11)).toBe('\\node[yshift=-0.5cm, draw, right=1.92em of c] (g) {G};');
	});
});

describe('flowchart steps', () => {
	const DOC = String.raw`\documentclass{article}
\usepackage{tikz}
\usetikzlibrary{arrows.meta}
\begin{document}
\begin{tikzpicture}
  \node[draw, minimum width=2cm] (s) at (0,0) {Start};
\end{tikzpicture}
\end{document}`;

	it('adds a step like the one it follows, on its side, and fans out where that side is taken', () => {
		const one = addStep(DOC, 0, 1, 'south', 'Step')!;
		expect(one.source).toContain('\\usetikzlibrary{arrows.meta,positioning}');
		expect(one.source).toContain('\\node[draw, minimum width=2cm, below=of s] (n1) {Step};\n  \\draw[->] (s) -- (n1);');
		expect(one.source.slice(one.at)).toMatch(/^\\node\[draw, minimum width=2cm, below=of s\] \(n1\)/);
		const two = addStep(one.source, 0, 1, 'south', 'Step')!;
		expect(two.source).toContain('\\node[draw, minimum width=2cm, right=of n1] (n2) {Step};');
		const diamond = writeNodeBox(two.source, st(two.source, 2), { shape: 'diamond' })!;
		expect(diamond).toContain('\\usetikzlibrary{arrows.meta,positioning,shapes.geometric}');
		expect(diamond).toContain('\\node[draw, below=of s, diamond, aspect=2, minimum width=2cm] (n1)');
	});
});

const PREAMBLE = '\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{positioning}\\def\\yaxis{1}';

describe.skipIf(!hasLualatex)('moves as TeX draws them', () => {
	useLualatex();
	const boxes = async (s: string) =>
		new Map(
			statementBoxes(buildDrawing(await drawWithLualatex(PREAMBLE, instrumentPicture(s, pic(s)))).parts, () => 10).map((b) => [b.stmt, b])
		);

	it('moves each by the drag: a placed node, a loop, a path through coordinates, a shift, a distance in em', async () => {
		const before = await boxes(SRC);
		const cm = 72 / 2.54;
		for (const k of [4, 5, 6, 8, 9, 10, 11]) {
			let after = shiftStatement(SRC, st(SRC, k), 0.5, -0.5);
			// a path's coordinates are moved with it, apart from it
			if (k === 6) after = shiftStatement(shiftStatement(SRC, st(SRC, 2), 0.5, -0.5), st(SRC, 1), 0.5, -0.5);
			const [a, b] = [before.get(k)!, (await boxes(after)).get(k)!];
			expect([(b.x1 - a.x1) / cm, (b.y1 - a.y1) / cm].map((v) => Math.round(v * 100) / 100)).toEqual([0.5, -0.5]);
		}
	});

	it('moves a node by its offset on the page, which the picture scale does not reach', async () => {
		const scaled = String.raw`\begin{tikzpicture}[scale=2]
  \node[draw] (a) at (0,0) {A};
  \node[draw, right=of a] (b) {B};
  \node[draw] at (a.north) {C};
  \draw (0,-\yaxis) -- (1,\yaxis);
\end{tikzpicture}`;
		const before = await boxes(scaled);
		const cm = 72 / 2.54;
		for (const k of [2, 3, 4]) {
			// half a unit is a cm on the page
			const after = (await boxes(shiftStatement(scaled, st(scaled, k), 0.5, 0, [1, 0]))).get(k)!;
			expect(Math.round(((after.x1 - before.get(k)!.x1) / cm) * 100) / 100).toBe(1);
		}
	});
});
