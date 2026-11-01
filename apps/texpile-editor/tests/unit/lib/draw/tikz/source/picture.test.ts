import { describe, expect, it } from 'vitest';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { listPictures, readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}[scale=2]
  \draw[thick, blue] (2,2) rectangle (6,5);
  \node (a) [draw] at (10,7) {$x$};
  \begin{scope}[shift={(1,0)}]
    \draw (0,0) -- ++(1,0) -- (a);
  \end{scope}
\end{tikzpicture}
`;

describe('reading the picture', () => {
	it('lists statements in scopes and marks each one for the engine', () => {
		const pic = readPicture(SRC)!;
		expect(pic.statements.map((s) => [s.kind, s.command, s.inScope])).toEqual([
			['path', '\\draw', false],
			['node', '\\node', false],
			['scope', '', false],
			['path', '\\draw', true]
		]);
		const sent = instrumentPicture(SRC, pic);
		expect(sent).toContain('\\tikzcapmark{4}\\draw[tikzcap transform=4] (0,0)');
		expect(sent).toContain('\\draw[thick, blue, tikzcap transform=1]');
		expect(sent).toMatch(/\\tikzcapmark\{0\}\\end\{tikzpicture\}$/);
	});
});

describe('pictures in a document', () => {
	it('keeps a picture nested in a node inside its outer picture', () => {
		const src =
			'Text \\begin{tikzpicture}\n  \\node (m) at (0,0) {\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}};\n  \\draw (2,0) -- (3,0);\n\\end{tikzpicture} % \\begin{tikzpicture}\n\\begin{tikzpicture}\\fill (0,0) circle (1); 50\\% \\end{tikzpicture}';
		expect(listPictures(src)).toHaveLength(2);
		const outer = readPicture(src, 0)!;
		expect(src.slice(outer.endFrom, outer.to)).toBe('\\end{tikzpicture}');
		expect(outer.to).toBe(src.indexOf(' % '));
		expect(outer.statements.map((s) => src.slice(s.from, s.to).slice(0, 12))).toEqual(['\\node (m) at', '\\draw (2,0) ']);
		expect(readPicture(src, 1)!.statements).toHaveLength(1);
		expect(listPictures('\\newcommand{\\chart}[1]{\\begin{tikzpicture}\\draw (0,0) -- (#1,0);\\end{tikzpicture}}')).toEqual([]);
		expect(listPictures('\\def\\chart#1{\\begin{tikzpicture}\\draw (0,0) -- (#1,0);\\end{tikzpicture}}')).toEqual([]);
		// a style's own argument is no definition's
		expect(listPictures('\\begin{tikzpicture}[dot/.style={circle, minimum size=#1}]\\node[dot=2pt] {};\\end{tikzpicture}')).toHaveLength(1);
	});

	it('reads a circuitikz circuit as the tikzpicture it is', () => {
		const src = '\\begin{circuitikz}[american]\n  \\draw (0,0) to[R] (2,0);\n\\end{circuitikz}';
		const picture = readPicture(src)!;
		expect([picture.env, src.slice(picture.bodyFrom, picture.endFrom)]).toEqual(['tikzpicture', '\n  \\draw (0,0) to[R] (2,0);\n']);
		expect(picture.statements.map((s) => s.kind)).toEqual(['path']);
	});

	it('reads a picture after prose with an open bracket, and skips one shown verbatim', () => {
		const src =
			'For $x \\in [0,1)$ we have \\verb|\\begin{tikzpicture}|:\n\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
		expect(listPictures(src)).toHaveLength(1);
		expect(readPicture(src)!.statements.map((s) => s.kind)).toEqual(['path']);
	});
});
