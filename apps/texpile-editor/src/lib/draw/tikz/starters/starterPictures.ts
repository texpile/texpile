import type { NewPictureKind } from '$lib/draw/editor/figure/figureLanguage';
import { NEW_DIAGRAM } from '../source/cd/cdPicture';
import { NEW_TREE } from '../source/forest/forestPicture';
import { NEW_PICTURE } from '../source/newPictures';

const FLOWCHART = String.raw`\begin{tikzpicture}[node distance=1.2cm]
  \node[draw, rounded corners, minimum width=3cm, minimum height=0.8cm] (start) {Start};
  \node[draw, minimum width=3cm, minimum height=0.8cm, below=of start] (step) {Do something};
  \node[draw, diamond, aspect=2, below=of step] (check) {Done?};
  \node[draw, rounded corners, minimum width=3cm, minimum height=0.8cm, below=of check] (end) {End};
  \draw[-Stealth] (start) -- (step);
  \draw[-Stealth] (step) -- (check);
  \draw[-Stealth] (check) -- (end) node[midway, right] {yes};
  \draw[-Stealth] (check.east) -| ++(1.5,0) |- (step.east) node[near start, right] {no};
\end{tikzpicture}
`;

const PLOT = String.raw`\begin{tikzpicture}
  \begin{axis}[axis lines=middle, xlabel=$x$, ylabel=$y$, width=9cm, height=6cm]
    \addplot[blue, thick, domain=-2:2, samples=60] {x^2};
    \addplot[red, thick, domain=-2:2, samples=60] {x^3};
  \end{axis}
\end{tikzpicture}
`;

const STATE_MACHINE = String.raw`\begin{tikzpicture}[node distance=3cm]
  \node[state, initial] (q0) {$q_0$};
  \node[state, accepting, right=of q0] (q1) {$q_1$};
  \draw[-Stealth] (q0) to[bend left] node[above] {a} (q1);
  \draw[-Stealth] (q1) to[bend left] node[below] {b} (q0);
  \draw[-Stealth] (q1) to[loop above] node[above] {a} (q1);
\end{tikzpicture}
`;

const FREE_BODY = String.raw`\begin{tikzpicture}[>={Stealth[length=2mm]}]
  \filldraw[fill=gray!20, thick] (0,0) rectangle (8,0.3); % beam
  \begin{scope} % pin at A
    \draw[thick] (0,0) -- (-0.3,-0.5) -- (0.3,-0.5) -- cycle;
    \draw[thick] (-0.5,-0.5) -- (0.5,-0.5);
    \foreach \x in {-0.4,-0.2,...,0.4}
      \draw (\x,-0.5) -- (\x-0.15,-0.65);
  \end{scope}
  \begin{scope} % roller at B
    \draw[thick] (8,0) -- (7.7,-0.4) -- (8.3,-0.4) -- cycle;
    \draw[thick] (7.8,-0.5) circle[radius=0.1];
    \draw[thick] (8.2,-0.5) circle[radius=0.1];
    \draw[thick] (7.5,-0.6) -- (8.5,-0.6);
    \foreach \x in {7.6,7.8,...,8.4}
      \draw (\x,-0.6) -- (\x-0.15,-0.75);
  \end{scope}
  \draw[->, very thick, red!70!orange] (3,1.8) node[above] {$P$} -- (3,0.3); % load
  \draw[->, very thick, green!50!black] (0,-2) -- node[left] {$A_y$} (0,-0.7); % reaction at A
  \draw[->, very thick, green!50!black] (8,-2) -- node[right] {$B_y$} (8,-0.8); % reaction at B
  \node[above left] at (0,0.3) {$A$};
  \node[above right] at (8,0.3) {$B$};
  \draw[thin, gray, dashed] (3,0) -- (3,-2.6);
  \draw[<->] (0,-2.5) -- node[below] {$a$} (3,-2.5);
  \draw[<->] (3,-2.5) -- node[below] {$L - a$} (8,-2.5);
\end{tikzpicture}
`;

const CIRCUIT = String.raw`\begin{circuitikz}
  \draw (0,0) to[V, v=$V_s$] (0,3);
  \draw (0,3) to[R=$R_1$] (3,3);
  \draw (3,3) to[C=$C_1$] (3,0);
  \draw (3,0) to[short] (0,0);
\end{circuitikz}
`;

function thumbOf(id: string) {
	return new URL(`./thumbs/${id}.svg`, import.meta.url).href;
}

/** the pictures a file can start from, each with what its preamble needs */
const STARTERS: NewPictureKind[] = [
	{ id: 'tikzpicture', name: 'Picture', text: NEW_PICTURE, usepackage: null, libraries: [] },
	{ id: 'flowchart', name: 'Flowchart', text: FLOWCHART, usepackage: null, libraries: ['positioning', 'arrows.meta', 'shapes.geometric'] },
	{ id: 'plot', name: 'Plot', text: PLOT, usepackage: 'pgfplots', libraries: [] },
	{ id: 'automaton', name: 'State machine', text: STATE_MACHINE, usepackage: null, libraries: ['automata', 'positioning', 'arrows.meta'] },
	{ id: 'tikzcd', name: 'Commutative diagram', text: NEW_DIAGRAM, usepackage: 'tikz-cd', libraries: [] },
	{ id: 'forest', name: 'Tree', text: NEW_TREE, usepackage: 'forest', libraries: [] },
	{ id: 'free-body', name: 'Free body diagram', text: FREE_BODY, usepackage: null, libraries: ['arrows.meta'] },
	{ id: 'circuit', name: 'Circuit', text: CIRCUIT, usepackage: 'circuitikz', libraries: [] }
];

export const STARTER_PICTURES: NewPictureKind[] = STARTERS.map((k) => (k.id === 'tikzpicture' ? k : { ...k, thumb: thumbOf(k.id) }));
