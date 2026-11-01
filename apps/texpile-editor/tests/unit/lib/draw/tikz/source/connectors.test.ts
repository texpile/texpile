import { describe, expect, it } from 'vitest';
import { readConnector, writeConnector, writeConnectorEnd } from '$lib/draw/tikz/source/connectors';
import { statementFor } from '$lib/draw/tikz/source/inserts/newStatements';
import { readNodeBox, readNodeLines, writeNodeBox, writeNodeLines } from '$lib/draw/tikz/source/nodes';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}
  \node[draw] (a) at (0,0) {A};
  \node[draw] (b) at (4,2) {B};
  \draw[->] (a) -- (b);
  \draw[->] (a.east) -| node[near start, above] {yes} (b);
  \draw (a) to[bend left=20] node[midway, below] {no} (b.west);
  \draw (a) .. controls (1,2) and (3,4) .. (b);
  \draw (0,0) -- (1,1) -- (2,0);
\end{tikzpicture}`;

const st = (s: string, i: number) => readPicture(s)!.statements.find((x) => x.i === i)!;

describe('reading connectors', () => {
	it('reads each end, the route and the label', () => {
		expect(readConnector(SRC, st(SRC, 3))).toEqual({
			ends: [
				{ node: 'a', anchor: null },
				{ node: 'b', anchor: null }
			],
			route: 'straight',
			bend: null,
			label: null
		});
		expect(readConnector(SRC, st(SRC, 4))).toMatchObject({
			ends: [{ node: 'a', anchor: 'east' }, { node: 'b' }],
			route: 'hv',
			label: { text: 'yes', pos: 'near start', side: 'above' }
		});
		expect(readConnector(SRC, st(SRC, 5))).toMatchObject({ route: 'bend left', label: { text: 'no', side: 'below' } });
		expect(readConnector(SRC, st(SRC, 6))?.route).toBe('curve');
	});

	it('is not a path of more than one step, or a node', () => {
		expect(readConnector(SRC, st(SRC, 7))).toBeNull();
		expect(readConnector(SRC, st(SRC, 1))).toBeNull();
	});
});

describe('writing connectors', () => {
	it('moves an end onto a node anchor or a point', () => {
		const onto = writeConnectorEnd(SRC, st(SRC, 3), 1, { node: 'b', anchor: 'north' })!;
		expect(onto).toContain('\\draw[->] (a) -- (b.north);');
		const off = writeConnectorEnd(SRC, st(SRC, 3), 0, { at: [1, 2.5] })!;
		expect(off).toContain('\\draw[->] (1,2.5) -- (b);');
	});

	it('changes the route, keeping the label and the bend', () => {
		expect(writeConnector(SRC, st(SRC, 4), { route: 'bend right' })).toContain(
			'\\draw[->] (a.east) to[bend right] (b) node[near start, above] {yes};'
		);
		expect(writeConnector(SRC, st(SRC, 5), { route: 'bend right' })).toContain('(a) to[bend right=20] (b.west) node[midway, below] {no};');
		expect(writeConnector(SRC, st(SRC, 6), { route: 'vh' })).toContain('\\draw (a) |- (b);');
	});

	it('adds, rewrites and removes the label', () => {
		const added = writeConnector(SRC, st(SRC, 3), { label: { text: 'go', pos: 'midway', side: 'above' } })!;
		expect(added).toContain('\\draw[->] (a) -- (b) node[midway, above] {go};');
		expect(readConnector(added, st(added, 3))?.label).toEqual({ text: 'go', pos: 'midway', side: 'above' });
		expect(writeConnector(SRC, st(SRC, 4), { label: null })).toContain('\\draw[->] (a.east) -| (b);');
		// a curve keeps its controls
		expect(writeConnector(SRC, st(SRC, 6), { label: { text: 'c', pos: 'near end', side: null } })).toContain(
			'\\draw (a) .. controls (1,2) and (3,4) .. (b) node[near end] {c};'
		);
	});
});

describe('a label where it is written', () => {
	const FORCES = String.raw`\begin{tikzpicture}
  \draw[->] (3.5,1.8) node[above] {$P$} -- (3.5,0.3);
  \draw[->] (0,-2) -- node[left] {$A_y$} (0,-0.7);
  \draw[->] (0,0) -- (8.5,0) node[right] {$x$};
  \draw[->] (1.6,5.9) node[below left, red] {weld} -- (2.6,6.9);
\end{tikzpicture}`;

	it('sits at the tail, the middle or the tip as written, and keeps its place when its text or side changes', () => {
		expect([1, 2, 3, 4].map((i) => readConnector(FORCES, st(FORCES, i))?.label?.pos)).toEqual(['at start', 'midway', 'at end', 'at start']);
		const retext = (i: number, change: { text?: string; side?: 'left' }) => {
			const label = readConnector(FORCES, st(FORCES, i))!.label!;
			return writeConnector(FORCES, st(FORCES, i), { label: { ...label, ...change } });
		};
		expect(retext(1, { text: 'F' })).toContain('\\draw[->] (3.5,1.8) node[above] {F} -- (3.5,0.3);');
		expect(retext(2, { side: 'left' })).toContain('\\draw[->] (0,-2) -- node[left] {$A_y$} (0,-0.7);');
		expect(retext(3, { text: 'u' })).toContain('\\draw[->] (0,0) -- (8.5,0) node[right] {u};');
		expect(retext(4, { text: 'seam' })).toContain('\\draw[->] (1.6,5.9) node[below left, red] {seam} -- (2.6,6.9);');
		// a new route keeps the label at the tip
		expect(writeConnector(FORCES, st(FORCES, 3), { route: 'hv' })).toContain('(0,0) -| (8.5,0) node[at end, right] {$x$};');
	});
});

describe('boxes connectors meet', () => {
	it('draws a box tool shape as an outlined node of that size', () => {
		expect(statementFor({ tool: 'box', from: [1, 1], to: [4, 2] })).toBe(
			'\\node[draw, minimum width=3cm, minimum height=1cm] at (2.5,1.5) {};'
		);
	});

	it('reads and writes the outline and least size, drawing a node that had none', () => {
		const s = String.raw`\begin{tikzpicture}
  \node (a) at (0,0) {A};
  \node[draw, circle, minimum size=10mm] (b) at (2,0) {B};
\end{tikzpicture}`;
		expect(readNodeBox(s, st(s, 2))).toEqual({ shape: 'circle', w: 1, h: 1, state: null });
		const drawn = writeNodeBox(s, st(s, 1), { shape: 'rounded', w: 2 })!;
		expect(drawn).toContain('\\node[draw, rounded corners, minimum width=2cm] (a) at (0,0) {A};');
		expect(writeNodeBox(s, st(s, 2), { shape: 'diamond' })).toContain(
			'\\node[draw, diamond, aspect=2, minimum width=1cm, minimum height=1cm] (b)'
		);
	});
});

describe('state machines', () => {
	it('reads and writes a loop from a state back to itself', () => {
		const s = String.raw`\begin{tikzpicture}
  \node[state] (q0) at (0,0) {$q_0$};
  \draw[->] (q0) to[loop above] node[above] {a} (q0);
\end{tikzpicture}`;
		expect(readConnector(s, st(s, 2))).toMatchObject({ route: 'loop above', label: { text: 'a' } });
		expect(writeConnector(s, st(s, 2), { route: 'loop right' })).toContain('\\draw[->] (q0) to[loop right] (q0) node[midway, above] {a};');
		expect(statementFor({ tool: 'arrow', from: { node: 'q0', at: [0, 0] }, to: { node: 'q0', at: [0, 0] }, route: 'loop below' })).toBe(
			'\\draw[->] (q0) to[loop below] (q0);'
		);
	});

	it('marks a state as where the machine starts or may stop', () => {
		const s = String.raw`\begin{tikzpicture}
  \node[state] (q0) at (0,0) {$q_0$};
\end{tikzpicture}`;
		expect(readNodeBox(s, st(s, 1))?.state).toEqual({ initial: false, accepting: false });
		const started = writeNodeBox(s, st(s, 1), { initial: true })!;
		const both = writeNodeBox(started, st(started, 1), { accepting: true })!;
		expect(both).toContain('\\node[state, initial, accepting] (q0)');
		expect(writeNodeBox(both, st(both, 1), { initial: false })).toContain('\\node[state, accepting] (q0)');
		expect(statementFor({ tool: 'state', at: [1, 2], name: 'q1', text: '$q_{1}$' })).toBe('\\node[state] (q1) at (1,2) {$q_{1}$};');
	});
});

describe('a label with braces in its text', () => {
	it('stays whole when the route is rewritten or the label taken off', () => {
		const s = String.raw`\begin{tikzpicture}
  \node (a) {A};
  \node (b) at (2,0) {B};
  \draw[->] (a) -- (b) node[midway, above] {$f_{2}$};
\end{tikzpicture}`;
		expect(writeConnector(s, st(s, 3), { route: 'hv' })).toContain('\\draw[->] (a) -| (b) node[midway, above] {$f_{2}$};');
		expect(writeConnector(s, st(s, 3), { label: null })).toContain('\\draw[->] (a) -- (b);');
	});
});

describe('typed text', () => {
	it('keeps a % or a # as the character it is typed as, in a node and in a label', () => {
		const s = String.raw`\begin{tikzpicture}
  \node (a) {A};
  \node (b) at (2,0) {B};
  \draw[->] (a) -- (b);
\end{tikzpicture}`;
		const typed = writeNodeLines(s, st(s, 1), ['50% done', 'item #1'])!;
		expect(typed).toContain('{50\\% done \\\\ item \\#1}');
		expect(readNodeLines(typed, st(typed, 1))).toEqual(['50% done', 'item #1']);
		const labelled = writeConnector(s, st(s, 3), { label: { text: '10%', pos: 'midway', side: 'above' } })!;
		expect(labelled).toContain('node[midway, above] {10\\%}');
		expect(readConnector(labelled, st(labelled, 3))?.label?.text).toBe('10%');
	});
});
