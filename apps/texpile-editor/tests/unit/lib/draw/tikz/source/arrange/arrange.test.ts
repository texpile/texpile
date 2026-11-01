import { describe, expect, it } from 'vitest';
import { groupStatements, moveStatements, ungroupStatement } from '$lib/draw/tikz/source/arrange/arrange';
import { readLabel, removeStatement, writeLabel } from '$lib/draw/tikz/source/arrange/blocks';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}
  \draw (0,0) rectangle (1,1); % back
  \draw (2,0) circle (1);
  \begin{scope}
    \node at (3,3) {a};
  \end{scope}
  \draw (4,0) -- (5,1);
\end{tikzpicture}`;

const picture = (s: string) => readPicture(s)!;
const startsAt = (s: string, at: number[]) => at.map((p) => s.slice(p, p + 10));

describe('moving statements', () => {
	it('brings one to the front with its label, and says where it went', () => {
		const out = moveStatements(SRC, picture(SRC), [1], { after: 5 })!;
		expect(out.source).toBe(String.raw`\begin{tikzpicture}
  \draw (2,0) circle (1);
  \begin{scope}
    \node at (3,3) {a};
  \end{scope}
  \draw (4,0) -- (5,1);
  \draw (0,0) rectangle (1,1); % back
\end{tikzpicture}`);
		expect(startsAt(out.source, out.at)).toEqual(['\\draw (0,0']);
	});

	it('moves into a scope at its indent, and back out before the first', () => {
		const into = moveStatements(SRC, picture(SRC), [5], { into: 3 })!;
		expect(into.source).toContain('    \\node at (3,3) {a};\n    \\draw (4,0) -- (5,1);\n  \\end{scope}\n\\end');
		const out = moveStatements(into.source, picture(into.source), [4], { before: 1 })!;
		expect(out.source.split('\n')[1]).toBe('  \\node at (3,3) {a};');
	});

	it('refuses to move a scope into itself', () => {
		expect(moveStatements(SRC, picture(SRC), [3], { into: 3 })).toBeNull();
	});
});

describe('grouping', () => {
	it('wraps siblings in a scope where the last one was, and unwraps it again', () => {
		const grouped = groupStatements(SRC, picture(SRC), [1, 5])!;
		expect(grouped.source).toBe(String.raw`\begin{tikzpicture}
  \draw (2,0) circle (1);
  \begin{scope}
    \node at (3,3) {a};
  \end{scope}
  \begin{scope}
    \draw (0,0) rectangle (1,1); % back
    \draw (4,0) -- (5,1);
  \end{scope}
\end{tikzpicture}`);
		const scope = picture(grouped.source).statements.find((s) => s.from === grouped.at[0])!;
		const back = ungroupStatement(grouped.source, picture(grouped.source), scope.i)!;
		expect(back.source).toContain('  \\draw (0,0) rectangle (1,1); % back\n  \\draw (4,0) -- (5,1);\n\\end');
		expect(back.at).toHaveLength(2);
	});

	it('keeps a scope whose options apply to what is in it', () => {
		const s = SRC.replace('\\begin{scope}', '\\begin{scope}[red]');
		expect(ungroupStatement(s, picture(s), 3)).toBeNull();
	});
});

describe('labels', () => {
	it('reads, writes and clears the comment after a statement', () => {
		const p = picture(SRC);
		expect(readLabel(SRC, p.statements[0])).toBe('back');
		expect(readLabel(SRC, p.statements[1])).toBeNull();
		const named = writeLabel(SRC, p.statements[1], 'Sun');
		expect(named).toContain('\\draw (2,0) circle (1); % Sun\n');
		expect(writeLabel(SRC, p.statements[0], '')).toContain('rectangle (1,1);\n');
	});

	it('writes a label on a line of its own when more follows the statement', () => {
		const s = '\\begin{tikzpicture}\\draw (0,0) -- (1,1); \\node (a) {A};\\end{tikzpicture}';
		const named = writeLabel(s, picture(s).statements[0], 'Line');
		expect(named).toBe('\\begin{tikzpicture}\\draw (0,0) -- (1,1); % Line\n\\node (a) {A};\\end{tikzpicture}');
		expect(readLabel(named, picture(named).statements[0])).toBe('Line');
	});

	it('goes with its statement when it is deleted', () => {
		expect(removeStatement(SRC, picture(SRC).statements[0])).not.toContain('back');
	});
});

describe('plots', () => {
	it('stay in their axis, where pgfplots draws them', () => {
		const s = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);
  \begin{axis}
    \addplot {x};
    \addplot {x^2};
  \end{axis}
\end{tikzpicture}`;
		const p = picture(s);
		const [plot, other] = p.statements.filter((x) => x.kind === 'plot');
		expect(moveStatements(s, p, [plot.i], { before: 1 })).toBeNull();
		expect(moveStatements(s, p, [1], { after: plot.i })).toBeNull();
		expect(moveStatements(s, p, [plot.i], { after: other.i })?.source).toContain('\\addplot {x^2};\n    \\addplot {x};');
	});
});
