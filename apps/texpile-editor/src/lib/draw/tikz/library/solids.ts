import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';

// drawn as textbooks draw them, in an oblique view: the faces toward the viewer shaded, the hidden edges dashed
function solid(id: string, name: string, text: string): LibraryElement {
	return { id, name, group: '3D', text, usepackage: null, libraries: [] };
}

export const SOLIDS: LibraryElement[] = [
	solid(
		'cube',
		'Cube',
		String.raw`\begin{scope}
  \fill[gray!10] (-1.6,-1.4) -- (0.4,-1.4) -- (0.4,0.6) -- (-1.6,0.6) -- cycle;
  \fill[gray!20] (-1.6,0.6) -- (0.4,0.6) -- (1.6,1.4) -- (-0.4,1.4) -- cycle;
  \fill[gray!35] (0.4,-1.4) -- (1.6,-0.6) -- (1.6,1.4) -- (0.4,0.6) -- cycle;
  \draw[densely dashed] (-1.6,-1.4) -- (-0.4,-0.6) -- (1.6,-0.6) (-0.4,-0.6) -- (-0.4,1.4);
  \draw (-1.6,-1.4) -- (0.4,-1.4) -- (1.6,-0.6) -- (1.6,1.4) -- (-0.4,1.4) -- (-1.6,0.6) -- cycle (-1.6,0.6) -- (0.4,0.6) -- (1.6,1.4) (0.4,0.6) -- (0.4,-1.4);
\end{scope}`
	),
	solid(
		'cuboid',
		'Cuboid',
		String.raw`\begin{scope}
  \fill[gray!10] (-1.95,-1.05) -- (1.05,-1.05) -- (1.05,0.45) -- (-1.95,0.45) -- cycle;
  \fill[gray!20] (-1.95,0.45) -- (1.05,0.45) -- (1.95,1.05) -- (-1.05,1.05) -- cycle;
  \fill[gray!35] (1.05,-1.05) -- (1.95,-0.45) -- (1.95,1.05) -- (1.05,0.45) -- cycle;
  \draw[densely dashed] (-1.95,-1.05) -- (-1.05,-0.45) -- (1.95,-0.45) (-1.05,-0.45) -- (-1.05,1.05);
  \draw (-1.95,-1.05) -- (1.05,-1.05) -- (1.95,-0.45) -- (1.95,1.05) -- (-1.05,1.05) -- (-1.95,0.45) -- cycle (-1.95,0.45) -- (1.05,0.45) -- (1.95,1.05) (1.05,0.45) -- (1.05,-1.05);
\end{scope}`
	),
	solid(
		'cylinder',
		'Cylinder',
		String.raw`\begin{scope}
  \shade[left color=gray!40, right color=gray!40, middle color=gray!5] (-1,-1) arc[start angle=180, end angle=360, x radius=1, y radius=0.35] -- (1,1) arc[start angle=0, end angle=-180, x radius=1, y radius=0.35] -- cycle;
  \filldraw[fill=gray!15] (0,1) ellipse[x radius=1, y radius=0.35];
  \draw[densely dashed] (1,-1) arc[start angle=0, end angle=180, x radius=1, y radius=0.35];
  \draw (-1,1) -- (-1,-1) arc[start angle=180, end angle=360, x radius=1, y radius=0.35] -- (1,1);
\end{scope}`
	),
	solid(
		'cone',
		'Cone',
		String.raw`\begin{scope}
  \shade[left color=gray!40, right color=gray!40, middle color=gray!5] (0,1.2) -- (-0.99,-1.15) arc[start angle=171.61, end angle=368.39, x radius=1, y radius=0.35] -- cycle;
  \draw[densely dashed] (0.99,-1.15) arc[start angle=8.39, end angle=171.61, x radius=1, y radius=0.35];
  \draw (0,1.2) -- (-0.99,-1.15) arc[start angle=171.61, end angle=368.39, x radius=1, y radius=0.35] -- cycle;
\end{scope}`
	),
	solid(
		'sphere',
		'Sphere',
		String.raw`\begin{scope}
  \shade[ball color=gray!25] (0,0) circle[radius=1.2];
  \draw (0,0) circle[radius=1.2];
  \draw (-1.2,0) arc[start angle=180, end angle=360, x radius=1.2, y radius=0.35];
  \draw[densely dashed] (1.2,0) arc[start angle=0, end angle=180, x radius=1.2, y radius=0.35];
\end{scope}`
	),
	solid(
		'pyramid',
		'Pyramid',
		String.raw`\begin{scope}
  \fill[gray!12] (-1.6,-1.5) -- (0.4,-1.5) -- (0,1.1) -- cycle;
  \fill[gray!30] (0.4,-1.5) -- (1.6,-0.7) -- (0,1.1) -- cycle;
  \draw[densely dashed] (-1.6,-1.5) -- (-0.4,-0.7) -- (1.6,-0.7) (-0.4,-0.7) -- (0,1.1);
  \draw (-1.6,-1.5) -- (0.4,-1.5) -- (1.6,-0.7) -- (0,1.1) -- cycle (0.4,-1.5) -- (0,1.1);
\end{scope}`
	),
	solid(
		'prism',
		'Prism',
		String.raw`\begin{scope}
  \fill[gray!12] (-1.68,-1.22) -- (0.72,-1.22) -- (-0.48,0.58) -- cycle;
  \fill[gray!30] (0.72,-1.22) -- (1.68,-0.58) -- (0.48,1.22) -- (-0.48,0.58) -- cycle;
  \draw[densely dashed] (-1.68,-1.22) -- (-0.72,-0.58) -- (1.68,-0.58) (-0.72,-0.58) -- (0.48,1.22);
  \draw (-1.68,-1.22) -- (0.72,-1.22) -- (1.68,-0.58) -- (0.48,1.22) -- (-0.48,0.58) -- cycle (0.72,-1.22) -- (-0.48,0.58);
\end{scope}`
	),
	solid(
		'tetrahedron',
		'Tetrahedron',
		String.raw`\begin{scope}
  \fill[gray!12] (-1.38,-1.22) -- (1.02,-1.22) -- (-0.02,1.22) -- cycle;
  \fill[gray!30] (1.02,-1.22) -- (1.38,-0.58) -- (-0.02,1.22) -- cycle;
  \draw[densely dashed] (-1.38,-1.22) -- (1.38,-0.58);
  \draw (-1.38,-1.22) -- (1.02,-1.22) -- (1.38,-0.58) -- (-0.02,1.22) -- cycle (1.02,-1.22) -- (-0.02,1.22);
\end{scope}`
	),
	solid(
		'frustum',
		'Frustum',
		String.raw`\begin{scope}
  \shade[left color=gray!40, right color=gray!40, middle color=gray!5] (-1.2,-1) arc[start angle=180, end angle=360, x radius=1.2, y radius=0.4] -- (0.6,1) arc[start angle=0, end angle=-180, x radius=0.6, y radius=0.2] -- cycle;
  \filldraw[fill=gray!15] (0,1) ellipse[x radius=0.6, y radius=0.2];
  \draw[densely dashed] (1.2,-1) arc[start angle=0, end angle=180, x radius=1.2, y radius=0.4];
  \draw (-0.6,1) -- (-1.2,-1) arc[start angle=180, end angle=360, x radius=1.2, y radius=0.4] -- (0.6,1);
\end{scope}`
	),
	solid(
		'hemisphere',
		'Hemisphere',
		String.raw`\begin{scope}
  \shade[ball color=gray!25] (-1.4,-0.5) arc[start angle=180, end angle=0, radius=1.4] arc[start angle=0, end angle=-180, x radius=1.4, y radius=0.45] -- cycle;
  \draw (-1.4,-0.5) arc[start angle=180, end angle=0, radius=1.4] arc[start angle=0, end angle=-180, x radius=1.4, y radius=0.45];
  \draw[densely dashed] (1.4,-0.5) arc[start angle=0, end angle=180, x radius=1.4, y radius=0.45];
\end{scope}`
	),
	solid(
		'hexagonal-prism',
		'Hexagonal prism',
		String.raw`\begin{scope}
  \fill[gray!12] (0.62,-0.32) -- (0.07,0.63) -- (-1.03,0.63) -- (-1.58,-0.32) -- (-1.03,-1.27) -- (0.07,-1.27) -- cycle;
  \fill[gray!22] (0.62,-0.32) -- (1.58,0.32) -- (1.03,1.27) -- (0.07,0.63) -- cycle;
  \fill[gray!30] (0.07,0.63) -- (1.03,1.27) -- (-0.07,1.27) -- (-1.03,0.63) -- cycle;
  \fill[gray!35] (0.07,-1.27) -- (1.03,-0.63) -- (1.58,0.32) -- (0.62,-0.32) -- cycle;
  \draw[densely dashed] (-0.07,1.27) -- (-0.62,0.32) (-0.62,0.32) -- (-0.07,-0.63) (-0.07,-0.63) -- (1.03,-0.63) (-1.58,-0.32) -- (-0.62,0.32) (-1.03,-1.27) -- (-0.07,-0.63);
  \draw (0.62,-0.32) -- (0.07,0.63) -- (-1.03,0.63) -- (-1.58,-0.32) -- (-1.03,-1.27) -- (0.07,-1.27) -- cycle (0.62,-0.32) -- (1.58,0.32) (0.07,0.63) -- (1.03,1.27) (-1.03,0.63) -- (-0.07,1.27) (0.07,-1.27) -- (1.03,-0.63) (1.58,0.32) -- (1.03,1.27) (1.03,1.27) -- (-0.07,1.27) (1.03,-0.63) -- (1.58,0.32);
\end{scope}`
	),
	solid(
		'axes-3d',
		'3D axes',
		String.raw`\begin{scope}
  \draw[->] (0,0) -- (2,0) node[right] {$y$};
  \draw[->] (0,0) -- (0,2) node[above] {$z$};
  \draw[->] (0,0) -- (-1.2,-0.8) node[below left] {$x$};
\end{scope}`
	)
];
