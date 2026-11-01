import { describe, expect, it } from 'vitest';
import { instrumentPicture, pictureContext } from '$lib/draw/tikz/source/instrument';
import { textProblem } from '$lib/draw/tikz/source/nodes';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}[scale=2]
  \draw[thick, blue] (2,2) rectangle (6,5);
  \node (a) [draw] at (10,7) {$x$};
  \begin{scope}[shift={(1,0)}]
    \draw (0,0) -- ++(1,0) -- (a);
  \end{scope}
\end{tikzpicture}
`;

describe('the body around a picture', () => {
	it('carries the set-up before the picture, never what typesets', () => {
		const src =
			'\\documentclass{article}\n\\tikzset{x=2cm}\n\\begin{document}\nSome text \\textbf{bold}.\n\\tdplotsetmaincoords{70}{130}\n% \\tikzset{ignored}\n\\tikzset{box/.style={draw, fill=red!10}}\n\\def\\r{1.5}\n\\begin{tikzpicture}\\node[box] at (0,0) {A};\\end{tikzpicture}';
		expect(pictureContext(src, readPicture(src)!)).toBe(
			'\\tdplotsetmaincoords{70}{130}\n\\tikzset{box/.style={draw, fill=red!10}}\n\\def\\r{1.5}'
		);
	});

	it('carries the layers a body declares', () => {
		const src =
			'\\begin{document}\n\\pgfdeclarelayer{background}\n\\pgfsetlayers{background,main}\n\\begin{tikzpicture}\\begin{pgfonlayer}{background}\\fill (0,0) circle (1);\\end{pgfonlayer}\\end{tikzpicture}';
		expect(pictureContext(src, readPicture(src)!)).toBe('\\pgfdeclarelayer{background}\n\\pgfsetlayers{background,main}');
	});

	it('carries a bare macro name as an argument, and a definition inside a body only once', () => {
		const src =
			'\\begin{document}\n\\pgfmathsetmacro\\r{1.5}\n\\newcommand{\\mk}[1]{\\def\\tmp##1{##1#1}}\n\\begin{tikzpicture}\\draw (0,0) circle (\\r);\\end{tikzpicture}';
		expect(pictureContext(src, readPicture(src)!)).toBe(
			'\\pgfmathsetmacro\\r{1.5}\n\\providecommand\\mk{}\\renewcommand{\\mk}[1]{\\def\\tmp##1{##1#1}}'
		);
	});
});

describe('macros defined in the body', () => {
	it('replays a macro defined before each figure without redefining errors', () => {
		const src =
			'\\begin{document}\n\\newcommand{\\s}{1}\n\\begin{tikzpicture}\\end{tikzpicture}\n\\newcommand\\s{2}\n\\begin{tikzpicture}\\draw (0,0) -- (\\s,0);\\end{tikzpicture}';
		expect(pictureContext(src, readPicture(src, 1)!)).toBe(
			'\\providecommand\\s{}\\renewcommand{\\s}{1}\n\\providecommand\\s{}\\renewcommand\\s{2}'
		);
		const local =
			'\\begin{document}\n\\begin{figure}\\tikzset{a/.style=red}\\begin{tikzpicture}\\newcommand{\\k}{1}\\end{tikzpicture}\\end{figure}\n\\begin{tikzpicture}\\end{tikzpicture}';
		expect(pictureContext(local, readPicture(local, 1)!)).toBe('');
	});
});

describe('a picture TeX cannot draw whole', () => {
	it('blanks a left-out statement where it stands, mark and all kept', () => {
		const pic = readPicture(SRC)!;
		const sent = instrumentPicture(SRC, pic, [2]);
		expect(sent).not.toContain('{$x$}');
		expect(sent).toContain('\\tikzcapmark{2}');
		expect(sent).toContain('\\tikzcapmark{3}');
		expect(sent).toContain('rectangle (6,5)');
	});

	it('refuses node text with an unclosed brace or math', () => {
		expect(textProblem('a \\(x')).toContain('\\)');
		expect(textProblem('$x')).toContain('$');
		expect(textProblem('{a')).toContain('}');
		expect(textProblem('50\\% of \\$5 and \\{ \\(x\\)')).toBeNull();
	});
});
