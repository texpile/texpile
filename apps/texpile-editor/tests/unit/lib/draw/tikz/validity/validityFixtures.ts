import { STARTER_PICTURES } from '$lib/draw/tikz/starters/starterPictures';
import { tikzLanguage as lang } from '$lib/draw/tikz/tikzLanguage';

function documentOf(preamble: string, body: string) {
	return `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\\end{document}\n`;
}

const SHAPES = String.raw`\begin{tikzpicture}
  \coordinate (o) at (0,0);
  \draw[thick, ->] (o) -- (2,0) -- (2,1); % Arm
  \draw (3,0) rectangle (4,1);
  \draw[fill=blue!20] (5,0.5) circle[radius=0.5];
  \draw (6,0) ellipse[x radius=0.6, y radius=0.3];
  \draw (0,2) .. controls (1,3) and (2,1) .. (3,2);
  \draw plot[smooth] coordinates {(4,2) (5,3) (6,2)};
  \draw (0,3) -- (1,3) -- (0.5,4) -- cycle;
  \node[draw] (a) at (1,5) {$x_{1}$};
  \node[draw, circle, right=1cm of a] (b) {B};
  \draw[->] (a) -- (b) node[midway, above] {$f_{2}$};
  \draw (a.south) to[bend left] (b.south);
  \draw (0,6) arc[start angle=0, end angle=90, radius=1];
  \draw[step=0.5, gray] (7,0) grid (8,1);
  \begin{scope}[shift={(8,3)}]
    \draw (0,0) -- (1,1);
    \node at (0,1) {S};
  \end{scope}
  \foreach \x in {0,1,2} \draw (\x,-1) circle[radius=0.1];
  \draw (0,-2) -- ++(1,0) -- +(0,1);
  \draw (30:1) -- (60:2);
\end{tikzpicture}
`;

const ONE_LINE = String.raw`\begin{tikzpicture}\draw (0,0) -- (1,1); \node[draw] (a) at (2,0) {A}; \draw (a) -- (3,1);\end{tikzpicture}
`;

const MACROS = String.raw`\begin{tikzpicture}
  \tikzset{box/.style={draw, thick}}
  \pgfmathsetmacro{\h}{1.5}
  \node[box] (p) at (0,0) {P};
  \draw (p) -- (\h,\h);
  \draw[box] (2,0) rectangle (3,\h);
\end{tikzpicture}
`;

const LAYERS = String.raw`\begin{tikzpicture}
  \node[draw] (a) at (0,0) {A};
  \begin{pgfonlayer}{bg}
    \fill[yellow] (-1,-1) rectangle (1,1);
  \end{pgfonlayer}
  \draw (1,0) -- (2,0);
\end{tikzpicture}
`;

const AXIS = String.raw`\begin{tikzpicture}
  \begin{axis}[width=6cm, at={(1cm,1cm)}]
    \addplot coordinates {(0,0) (1,1) (2,0)};
    \addplot[red] {x};
    \node at (axis cs:1,1) {top};
  \end{axis}
  \draw (0,0) -- (1,0);
\end{tikzpicture}
`;

const AMPERSANDS = String.raw`\begin{tikzcd}[ampersand replacement=\&]
  A \arrow[r, "f"] \& B \arrow[d] \\
  \& C
\end{tikzcd}
`;

const TIKZ = '\\usepackage{tikz}';

/** a document of each kind of picture the editor reads, each preamble with only what its picture needs */
export const FIXTURES: { name: string; source: string }[] = [
	...STARTER_PICTURES.map((kind) => ({ name: `starter ${kind.id}`, source: lang.replacePicture(documentOf(TIKZ, ''), kind) })),
	{ name: 'shapes', source: documentOf(`${TIKZ}\n\\usetikzlibrary{positioning}`, SHAPES) },
	{ name: 'one line', source: documentOf(TIKZ, ONE_LINE) },
	{ name: 'macros', source: documentOf(TIKZ, MACROS) },
	{ name: 'layers', source: documentOf(`${TIKZ}\n\\pgfdeclarelayer{bg}\n\\pgfsetlayers{bg,main}`, LAYERS) },
	{ name: 'axis', source: documentOf(`${TIKZ}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}`, AXIS) },
	{ name: 'ampersands', source: documentOf(`${TIKZ}\n\\usepackage{tikz-cd}`, AMPERSANDS) }
];

/** what a user may type into a node, a label or a cell; a backslash starts a command, and whether TeX knows it is
 *  TeX's to say */
export const TYPED_TEXTS = ['Plain', '50% done', 'a_b', 'x^2', 'Q & A', 'item #1', 'a, b', '[x]', '$x_{1}$', '\\textbf{b}', '~', 'a=b'];
