import { element } from './libraryElement';

// a free body diagram's parts as a statics textbook draws them: supports on hatched ground, loads, beams
function mechanics(id: string, name: string, text: string) {
	return element('Mechanics', id, name, text, ['arrows.meta']);
}

export const MECHANICS = [
	mechanics(
		'pin-support',
		'Pin support',
		String.raw`\begin{scope}
  \draw[thick] (0,0) -- (-0.3,-0.5) -- (0.3,-0.5) -- cycle;
  \draw[thick] (-0.5,-0.5) -- (0.5,-0.5);
  \foreach \x in {-0.4,-0.2,...,0.4}
    \draw (\x,-0.5) -- (\x-0.15,-0.65);
\end{scope}`
	),
	mechanics(
		'roller-support',
		'Roller support',
		String.raw`\begin{scope}
  \draw[thick] (0,0) -- (-0.3,-0.4) -- (0.3,-0.4) -- cycle;
  \draw[thick] (-0.2,-0.5) circle[radius=0.1];
  \draw[thick] (0.2,-0.5) circle[radius=0.1];
  \draw[thick] (-0.5,-0.6) -- (0.5,-0.6);
  \foreach \x in {-0.4,-0.2,...,0.4}
    \draw (\x,-0.6) -- (\x-0.15,-0.75);
\end{scope}`
	),
	mechanics(
		'fixed-support',
		'Fixed support',
		String.raw`\begin{scope}
  \draw[thick] (0,-0.6) -- (0,0.6);
  \foreach \y in {-0.4,-0.2,...,0.6}
    \draw (0,\y) -- (-0.15,\y-0.15);
\end{scope}`
	),
	mechanics(
		'ground',
		'Ground',
		String.raw`\begin{scope}
  \draw[thick] (-1.5,0) -- (1.5,0);
  \foreach \x in {-1.3,-1.1,...,1.5}
    \draw (\x,0) -- (\x-0.15,-0.15);
\end{scope}`
	),
	mechanics('point-load', 'Point load', String.raw`\draw[-Stealth, very thick] (0,1.5) node[above] {$P$} -- (0,0);`),
	mechanics(
		'distributed-load',
		'Distributed load',
		String.raw`\begin{scope}
  \draw (-1.5,0.8) -- (1.5,0.8);
  \foreach \x in {-1.5,-1,...,1.5}
    \draw[-Stealth] (\x,0.8) -- (\x,0);
  \node[above] at (0,0.8) {$w$};
\end{scope}`
	),
	mechanics(
		'linear-load',
		'Linearly varying load',
		String.raw`\begin{scope}
  \draw (-1.5,0) -- (1.5,1.2);
  \foreach \x/\h in {-1/0.2, -0.5/0.4, 0/0.6, 0.5/0.8, 1/1, 1.5/1.2}
    \draw[-Stealth] (\x,\h) -- (\x,0);
  \node[above] at (1.5,1.2) {$w_0$};
\end{scope}`
	),
	mechanics(
		'moment',
		'Moment',
		String.raw`\begin{scope}
  \draw[-Stealth, thick] (0.5,0) arc[start angle=0, end angle=270, radius=0.5];
  \fill (0,0) circle[radius=1.5pt];
  \node at (0.6,0.6) {$M$};
\end{scope}`
	),
	mechanics(
		'simply-supported-beam',
		'Simply supported beam',
		String.raw`\begin{scope}
  \filldraw[fill=gray!20, thick] (-2.5,0) rectangle (2.5,0.3);
  \draw[thick] (-2.5,0) -- (-2.8,-0.5) -- (-2.2,-0.5) -- cycle;
  \draw[thick] (-3,-0.5) -- (-2,-0.5);
  \foreach \x in {-2.9,-2.7,...,-2.1}
    \draw (\x,-0.5) -- (\x-0.15,-0.65);
  \draw[thick] (2.5,0) -- (2.2,-0.4) -- (2.8,-0.4) -- cycle;
  \draw[thick] (2.3,-0.5) circle[radius=0.1];
  \draw[thick] (2.7,-0.5) circle[radius=0.1];
  \draw[thick] (2,-0.6) -- (3,-0.6);
  \foreach \x in {2.1,2.3,...,2.9}
    \draw (\x,-0.6) -- (\x-0.15,-0.75);
  \node[above left] at (-2.5,0.3) {$A$};
  \node[above right] at (2.5,0.3) {$B$};
\end{scope}`
	),
	mechanics(
		'cantilever',
		'Cantilever beam',
		String.raw`\begin{scope}
  \draw[thick] (-2.5,-0.8) -- (-2.5,0.8);
  \foreach \y in {-0.6,-0.4,...,0.8}
    \draw (-2.5,\y) -- (-2.65,\y-0.15);
  \filldraw[fill=gray!20, thick] (-2.5,-0.15) rectangle (2.5,0.15);
  \draw[-Stealth, very thick] (2.5,1.3) node[above] {$P$} -- (2.5,0.15);
\end{scope}`
	),
	mechanics(
		'i-beam-section',
		'I-beam section',
		String.raw`\begin{scope}
  \filldraw[fill=gray!20, thick] (-1.2,-1.5) rectangle (1.2,-1.2);
  \filldraw[fill=gray!20, thick] (-0.15,-1.2) rectangle (0.15,1.2);
  \filldraw[fill=gray!20, thick] (-1.2,1.2) rectangle (1.2,1.5);
\end{scope}`
	),
	mechanics(
		'damper',
		'Damper',
		String.raw`\begin{scope}
  \draw (-1.5,0) -- (-0.4,0);
  \draw (0.5,0.3) -- (-0.4,0.3) -- (-0.4,-0.3) -- (0.5,-0.3);
  \draw[thick] (0.1,-0.22) -- (0.1,0.22);
  \draw (0.1,0) -- (1.5,0);
\end{scope}`
	),
	mechanics(
		'pulley',
		'Pulley with two masses',
		String.raw`\begin{scope}
  \draw[thick] (-0.8,1.6) -- (0.8,1.6);
  \foreach \x in {-0.6,-0.4,...,0.8}
    \draw (\x,1.6) -- (\x-0.15,1.75);
  \draw (0,1.6) -- (0,0);
  \draw[thick] (0,0) circle[radius=0.5];
  \fill (0,0) circle[radius=1.5pt];
  \draw (-0.5,0) -- (-0.5,-1.2);
  \draw (0.5,0) -- (0.5,-0.6);
  \draw[fill=gray!20] (-0.8,-1.2) rectangle (-0.2,-1.7);
  \draw[fill=gray!20] (0.2,-0.6) rectangle (0.8,-1.1);
  \node at (-0.5,-1.45) {$m_1$};
  \node at (0.5,-0.85) {$m_2$};
\end{scope}`
	)
];
