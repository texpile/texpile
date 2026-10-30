import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';
import { element } from './libraryElement';
import { MATH, PHYSICS } from './mathElements';
import { MECHANICS } from './mechanicsElements';
import { LINES, SHAPES } from './shapeElements';
import { SOLIDS } from './solids';

function plot(id: string, name: string, body: string) {
	// centered on where it is put, and moved by its own place
	const axis = `\\begin{axis}[at={(0cm,0cm)}, anchor=center, width=7cm, height=5cm, ${body}\n\\end{axis}`;
	return element('Plots', id, name, axis, [], 'pgfplots');
}

const DIAGRAMS = [
	element(
		'Diagrams',
		'venn-2',
		'Venn, two sets',
		String.raw`\begin{scope}
  \draw[fill=red, fill opacity=0.2] (-0.6,0) circle[radius=1.2];
  \draw[fill=blue, fill opacity=0.2] (0.6,0) circle[radius=1.2];
  \node at (-1.2,0) {$A$};
  \node at (1.2,0) {$B$};
\end{scope}`
	),
	element(
		'Diagrams',
		'venn-3',
		'Venn, three sets',
		String.raw`\begin{scope}
  \draw[fill=red, fill opacity=0.2] (-0.6,0.4) circle[radius=1.1];
  \draw[fill=blue, fill opacity=0.2] (0.6,0.4) circle[radius=1.1];
  \draw[fill=green, fill opacity=0.2] (0,-0.6) circle[radius=1.1];
  \node at (-1.1,0.8) {$A$};
  \node at (1.1,0.8) {$B$};
  \node at (0,-1.2) {$C$};
\end{scope}`
	),
	element(
		'Diagrams',
		'timeline',
		'Timeline',
		String.raw`\begin{scope}
  \draw[->, thick] (-2.5,0) -- (2.5,0);
  \foreach \x/\t in {-2/2020, 0/2022, 2/2024} \draw (\x,0.1) -- (\x,-0.1) node[below] {\t};
\end{scope}`
	),
	element(
		'Diagrams',
		'cycle',
		'Cycle',
		String.raw`\begin{scope}
  \draw[->, thick] (110:1.3) arc[start angle=110, end angle=190, radius=1.3];
  \draw[->, thick] (230:1.3) arc[start angle=230, end angle=310, radius=1.3];
  \draw[->, thick] (350:1.3) arc[start angle=350, end angle=430, radius=1.3];
  \node[draw, circle, fill=white] at (90:1.3) {1};
  \node[draw, circle, fill=white] at (210:1.3) {2};
  \node[draw, circle, fill=white] at (330:1.3) {3};
\end{scope}`
	)
];

const PLOTS = [
	plot('line-plot', 'Line plot', 'xlabel=$x$, ylabel=$y$]\n  \\addplot[blue, thick, domain=-2:2, samples=50] {x^3 - 2*x};'),
	plot(
		'scatter-plot',
		'Scatter plot',
		'xlabel=$x$, ylabel=$y$]\n  \\addplot[only marks] coordinates {(1,2) (2,3.1) (3,3.8) (4,5.2) (5,5.9)};'
	),
	plot(
		'bar-chart',
		'Bar chart',
		'ybar, xtick={1,2,3,4}, xticklabels={A,B,C,D}, ymin=0]\n  \\addplot coordinates {(1,3) (2,5) (3,2) (4,4)};'
	)
];

/** what the library adds, by group, each written around the origin */
export const LIBRARY_ELEMENTS: LibraryElement[] = [
	...SHAPES,
	...LINES,
	...MATH,
	...PHYSICS,
	...MECHANICS,
	...DIAGRAMS,
	...SOLIDS,
	...PLOTS
];
