import { describe, expect, it } from 'vitest';
import { NEW_PICTURE, withCommandAsPicture, withPicture } from '$lib/draw/tikz/source/inserts/newPictures';

const SRC = String.raw`\begin{tikzpicture}[scale=2]
  \draw[thick, blue] (2,2) rectangle (6,5);
  \node (a) [draw] at (10,7) {$x$};
  \begin{scope}[shift={(1,0)}]
    \draw (0,0) -- ++(1,0) -- (a);
  \end{scope}
\end{tikzpicture}
`;

describe('a text with no picture', () => {
	it('gets a new one before \\end{document}, or at its end', () => {
		expect(withPicture('')).toBe(NEW_PICTURE);
		const doc = '\\documentclass{article}\n\\begin{document}\n\\end{document}\n';
		expect(withPicture(doc)).toBe(`\\documentclass{article}\n\\begin{document}\n${NEW_PICTURE}\\end{document}\n`);
		expect(withPicture(SRC)).toBe(SRC);
	});
});

describe('a text with a \\tikz command and no picture', () => {
	it('shows its first command as the tikzpicture it is, braced or up to its ;', () => {
		const doc = (body: string) =>
			`\\documentclass{standalone}\n\\usepackage{tikz}\\tikzset{a/.style={}}\n\\begin{document}\n${body}\n\\end{document}\n`;
		expect(withCommandAsPicture(doc('% \\tikz \\fill (0,0) circle (1);\n\\tikz[scale=2]{\n  \\draw (0,0) -- (1,{1});\n}'))).toBe(
			doc('% \\tikz \\fill (0,0) circle (1);\n\\begin{tikzpicture}[scale=2]\n  \\draw (0,0) -- (1,{1});\n\\end{tikzpicture}')
		);
		expect(withCommandAsPicture(doc('Text \\tikz \\node {a;b}; and \\tikz \\draw (0,0);'))).toBe(
			doc('Text \\begin{tikzpicture}\n  \\node {a;b};\n\\end{tikzpicture} and \\tikz \\draw (0,0);')
		);
		expect(withCommandAsPicture(SRC)).toBe(SRC);
	});
});
