import { describe, expect, it } from 'vitest';
import { removeStatement } from '$lib/draw/tikz/source/arrange/blocks';
import { pathPoints } from '$lib/draw/tikz/source/coordinates';
import { readFrame, writeFrame } from '$lib/draw/tikz/source/frame';
import { appendShape, appendStatement, statementFor } from '$lib/draw/tikz/source/inserts/newStatements';
import { ensureNodeName, nodeName } from '$lib/draw/tikz/source/nodes';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}[scale=2]
  \draw[thick, blue] (2,2) rectangle (6,5);
  \node (a) [draw] at (10,7) {$x$};
  \begin{scope}[shift={(1,0)}]
    \draw (0,0) -- ++(1,0) -- (a);
  \end{scope}
\end{tikzpicture}
`;

describe('adding, removing and framing', () => {
	it('appends with the indent of the last statement and removes whole lines', () => {
		const pic = readPicture(SRC)!;
		const { source } = appendStatement(SRC, pic, '\\draw (0,0) -- (1,1);');
		expect(source).toContain('  \\end{scope}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}');
		expect(removeStatement(SRC, pic.statements[1])).not.toContain('\\node');
		expect(removeStatement(SRC, pic.statements[1]).split('\n')).toHaveLength(SRC.split('\n').length - 1);
	});

	it('adds a frame as the first statement and resizes it in place', () => {
		const framed = writeFrame(SRC, readPicture(SRC)!, { x1: 0, y1: 0, x2: 15, y2: 10 });
		expect(framed).toContain('[scale=2]\n  \\useasboundingbox (0,0) rectangle (15,10);\n  \\draw[thick');
		const resized = writeFrame(framed, readPicture(framed)!, { x1: 0, y1: 0, x2: 12, y2: 8.5 });
		expect(readFrame(resized, readPicture(resized)!)).toMatchObject({ x2: 12, y2: 8.5 });
	});
});

describe('connecting to nodes', () => {
	it('names an unnamed node after its options and points a new path at it', () => {
		const src = '\\begin{tikzpicture}\n  \\node[draw] at (0,0) {A};\n  \\node (b) at (3,0) {B};\n\\end{tikzpicture}';
		const pic = readPicture(src)!;
		expect(nodeName(src, pic.statements[1])).toBe('b');
		const named = ensureNodeName(src, pic.statements[0]);
		expect(named).toMatchObject({ name: 'n1' });
		expect(named.source).toContain('\\node[draw] (n1) at (0,0) {A};');
		expect(statementFor({ tool: 'arrow', from: { node: 'n1', at: [0, 0] }, to: { node: 'b', at: [3, 0] } })).toBe(
			'\\draw[->] (n1) -- (b);'
		);
	});
});

describe('new polygons and axes', () => {
	it('writes them with plain points the canvas can move, labels and all', () => {
		const axes = statementFor({ tool: 'axes', from: [0, 0], to: [-4, 3] });
		expect(axes).toBe('\\draw[<->] (0,3) node[above] {$y$} -- (0,0) -- (-4,0) node[left] {$x$};');
		const polygon = statementFor({
			tool: 'polygon',
			points: [
				[0, 0],
				[2, 0],
				[1, 1.5]
			]
		});
		const src = `\\begin{tikzpicture}\n  ${axes}\n  ${polygon}\n\\end{tikzpicture}`;
		const [a, p] = readPicture(src)!.statements;
		expect(pathPoints(src, a).map((q) => [q.x, q.y])).toEqual([
			[0, 3],
			[0, 0],
			[-4, 0]
		]);
		expect(pathPoints(src, p).map((q) => [q.x, q.y])).toEqual([
			[0, 0],
			[2, 0],
			[1, 1.5]
		]);
	});
});

describe('what a tool needs', () => {
	it('goes into the preamble with what the tool draws', () => {
		const doc =
			'\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\n\\end{tikzpicture}\n\\end{document}\n';
		expect(appendShape(doc, 0, { tool: 'state', at: [0, 0] })).toContain('\\usetikzlibrary{automata}');
		expect(appendShape(doc, 0, { tool: 'plot', at: [0, 0] })).toContain('\\usepackage{pgfplots}');
		expect(appendShape(doc, 0, { tool: 'box', from: [0, 0], to: [2, 1], shape: 'ellipse' })).toContain(
			'\\usetikzlibrary{shapes.geometric}'
		);
	});
});
