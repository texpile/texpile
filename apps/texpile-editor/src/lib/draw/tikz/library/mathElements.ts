import { element } from './libraryElement';

function math(id: string, name: string, text: string, libraries: string[] = []) {
	return element('Math', id, name, text, libraries);
}

const AXES = String.raw`  \draw[->] (-2,0) -- (2,0) node[right] {$x$};
  \draw[->] (0,-1.5) -- (0,2) node[above] {$y$};`;

export const MATH = [
	math('axes', 'Axes', `\\begin{scope}\n${AXES}\n\\end{scope}`),
	math('grid', 'Grid', '\\draw[step=0.5, gray!50, very thin] (-2,-1.5) grid (2,1.5);'),
	math(
		'graph',
		'Graph of a function',
		`\\begin{scope}\n${AXES}\n  \\draw[thick, blue, domain=-1.4:1.4, smooth, variable=\\x] plot ({\\x}, {\\x*\\x});\n\\end{scope}`
	),
	math('point', 'Point', '\\fill (0,0) circle[radius=2pt] node[above right] {$P$};'),
	math('vector', 'Vector', '\\draw[-Stealth, thick] (-1,-0.5) -- (1,0.5) node[midway, above left] {$\\vec{v}$};', ['arrows.meta']),
	math(
		'angle',
		'Angle',
		String.raw`\begin{scope}
  \draw (-1,-0.5) -- (1,-0.5);
  \draw (-1,-0.5) -- (0.5,0.8);
  \draw (-0.4,-0.5) arc[start angle=0, end angle=41, radius=0.6] node[midway, right] {$\alpha$};
\end{scope}`
	),
	math(
		'right-angle',
		'Right angle',
		String.raw`\begin{scope}
  \draw (-1,-1) -- (1,-1);
  \draw (-1,-1) -- (-1,1);
  \draw (-0.7,-1) -- (-0.7,-0.7) -- (-1,-0.7);
\end{scope}`
	),
	math(
		'labeled-triangle',
		'Triangle ABC',
		'\\draw (-1.5,-1) node[below left] {$A$} -- (1.5,-1) node[below right] {$B$} -- (0.3,1.2) node[above] {$C$} -- cycle;'
	),
	math(
		'unit-circle',
		'Unit circle',
		String.raw`\begin{scope}
  \draw[->] (-1.8,0) -- (1.8,0) node[right] {$x$};
  \draw[->] (0,-1.8) -- (0,1.8) node[above] {$y$};
  \draw (0,0) circle[radius=1.4];
  \draw[thick] (0,0) -- (40:1.4) node[above right] {$P$};
\end{scope}`
	),
	math(
		'number-line',
		'Number line',
		String.raw`\begin{scope}
  \draw[->] (-2.5,0) -- (2.5,0);
  \foreach \n in {-2,...,2} \draw (\n,0.1) -- (\n,-0.1) node[below] {$\n$};
\end{scope}`
	),
	math(
		'coordinate-plane',
		'Coordinate plane',
		`\\begin{scope}\n  \\draw[step=0.5, gray!40, very thin] (-2,-1.5) grid (2,1.5);\n${AXES}\n\\end{scope}`
	),
	math(
		'sine-graph',
		'Sine graph',
		`\\begin{scope}\n${AXES}\n  \\draw[thick, blue, domain=-2:2, smooth, samples=60, variable=\\x] plot ({\\x}, {sin(deg(1.6*\\x))});\n\\end{scope}`
	),
	math(
		'tangent',
		'Tangent line',
		String.raw`\begin{scope}
  \draw[thick, domain=-1.6:1.6, smooth, variable=\x] plot ({\x}, {0.5*\x*\x - 0.5});
  \draw[red] (-0.4,-1.14) -- (2,0.78);
  \fill (0.8,-0.18) circle[radius=1.5pt];
\end{scope}`
	),
	math(
		'circle-radius',
		'Circle with radius',
		String.raw`\begin{scope}
  \draw (0,0) circle[radius=1.4];
  \fill (0,0) circle[radius=1.5pt];
  \draw (0,0) -- (1.4,0) node[midway, above] {$r$};
\end{scope}`
	),
	math(
		'right-triangle',
		'Right triangle',
		String.raw`\begin{scope}
  \draw (-1.5,-1) -- (1.5,-1) -- (1.5,1) -- cycle;
  \draw (1.2,-1) -- (1.2,-0.7) -- (1.5,-0.7);
  \node[below] at (0,-1) {$a$};
  \node[right] at (1.5,0) {$b$};
  \node[above left] at (0,0) {$c$};
\end{scope}`
	),
	math(
		'parallel-lines',
		'Parallel lines',
		String.raw`\begin{scope}
  \draw (-2,0.5) -- (2,0.5);
  \draw (-2,-0.5) -- (2,-0.5);
  \draw (-1,-1.2) -- (1,1.2);
\end{scope}`
	),
	math(
		'vector-sum',
		'Vector sum',
		String.raw`\begin{scope}
  \draw[-Stealth, thick] (-1.4,-1) -- (0.6,-0.5) node[midway, below] {$\vec{a}$};
  \draw[-Stealth, thick] (-1.4,-1) -- (-0.6,0.5) node[midway, left] {$\vec{b}$};
  \draw[dashed] (0.6,-0.5) -- (1.4,1) -- (-0.6,0.5);
  \draw[-Stealth, thick, blue] (-1.4,-1) -- (1.4,1) node[midway, above left] {$\vec{a}+\vec{b}$};
\end{scope}`,
		['arrows.meta']
	),
	math(
		'ellipse-foci',
		'Ellipse with foci',
		String.raw`\begin{scope}
  \draw (0,0) ellipse[x radius=2, y radius=1.2];
  \fill (-1.6,0) circle[radius=1.5pt] node[below] {$F_1$};
  \fill (1.6,0) circle[radius=1.5pt] node[below] {$F_2$};
\end{scope}`
	)
];

export const PHYSICS = [
	element(
		'Physics',
		'inclined-plane',
		'Inclined plane',
		String.raw`\begin{scope}
  \draw (-2,-1) -- (2,-1) -- (2,1) -- cycle;
  \draw[rotate around={26.57:(0,0)}, fill=gray!20] (-0.4,0) rectangle (0.4,0.6);
  \draw[->, thick] (-0.13,0.27) -- (-0.13,-0.6) node[below] {$mg$};
  \draw (-1.2,-1) arc[start angle=0, end angle=26.57, radius=0.8] node[midway, right] {$\theta$};
\end{scope}`
	),
	element(
		'Physics',
		'pendulum',
		'Pendulum',
		String.raw`\begin{scope}
  \draw[thick] (-1,1.5) -- (1,1.5);
  \draw[dashed] (0,1.5) -- (0,-0.8);
  \draw (0,1.5) -- (1,-0.5);
  \filldraw[fill=gray!40] (1,-0.5) circle[radius=0.25];
  \draw (0,0.9) arc[start angle=-90, end angle=-63.43, radius=0.6] node[midway, below] {$\theta$};
\end{scope}`
	),
	element(
		'Physics',
		'forces',
		'Forces on a block',
		String.raw`\begin{scope}
  \draw[fill=gray!20] (-0.6,-0.4) rectangle (0.6,0.4);
  \draw[->, thick] (0,0.4) -- (0,1.3) node[above] {$N$};
  \draw[->, thick] (0,-0.4) -- (0,-1.3) node[below] {$mg$};
  \draw[->, thick] (0.6,0) -- (1.6,0) node[right] {$F$};
  \draw[->, thick] (-0.6,0) -- (-1.4,0) node[left] {$f$};
\end{scope}`
	)
];
