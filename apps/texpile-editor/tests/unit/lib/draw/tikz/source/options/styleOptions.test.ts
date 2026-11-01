import { describe, expect, it } from 'vitest';
import { readCommandOptions, writeCommandOptions } from '$lib/draw/tikz/source/options/optionList';
import { readStyle, withArrows, withFill, withStroke, withWidth } from '$lib/draw/tikz/source/options/styleOptions';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}[scale=2]
  \draw[thick, blue] (2,2) rectangle (6,5);
  \node (a) [draw] at (10,7) {$x$};
  \begin{scope}[shift={(1,0)}]
    \draw (0,0) -- ++(1,0) -- (a);
  \end{scope}
\end{tikzpicture}
`;

describe('styling', () => {
	it('reads and rewrites a path and a node command', () => {
		const pic = readPicture(SRC)!;
		const draw = readCommandOptions(SRC, pic.statements[0])!;
		expect(readStyle(draw.items, 'draw')).toMatchObject({ stroke: 'blue', fill: null, width: 'thick', arrows: '' });
		let items = withStroke(draw.items, 'draw', 'red!60');
		items = withFill(items, 'draw', 'yellow');
		items = withWidth(items, 'thin');
		expect(writeCommandOptions(SRC, draw, items)).toContain('\\draw[red!60, fill=yellow] (2,2)');
		// a comment in the list would hide its closing bracket once the list is one line
		const commented = '\\begin{tikzpicture}\\draw[thick, % note\n    red % last\n  ] (0,0) -- (1,1);\\end{tikzpicture}';
		const own = readCommandOptions(commented, readPicture(commented)!.statements[0])!;
		expect(own.items).toEqual(['thick', 'red']);

		const node = readCommandOptions(SRC, pic.statements[1])!;
		expect(readStyle(node.items, 'node').stroke).toBe('black');
		expect(writeCommandOptions(SRC, node, withStroke(node.items, 'node', null))).toContain('\\node (a) at');

		const inner = readCommandOptions(SRC, pic.statements[3])!;
		expect(writeCommandOptions(SRC, inner, withArrows(inner.items, '->'))).toContain('\\draw[->] (0,0)');
	});
});
