import { describe, expect, it } from 'vitest';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { readArrow, arrowItems } from '$lib/draw/tikz/source/cd/cdArrows';
import { addArrow, addCell, arrowAt, moveCell, pointArrow, removeCell, writeArrowItems } from '$lib/draw/tikz/source/cd/cdEdits';

const SRC = String.raw`\begin{document}
\begin{tikzcd}
  A \arrow[r, "f"] \arrow[d, "g"'] & B \arrow[d, hook] \\
  C \arrow[r, dashed, bend left] & D
\end{tikzcd}
\end{document}`;

const pic = (s: string) => readPicture(s)!;
const kinds = (s: string) => pic(s).statements.map((x) => `${x.kind}:${s.slice(x.from, x.to)}`);
const cell = (s: string, text: string) => pic(s).statements.find((x) => x.kind === 'cell' && s.slice(x.from, x.to) === text)!;
const arrow = (s: string, k: number) => pic(s).statements.filter((x) => x.kind === 'arrow')[k];

describe('reading a diagram', () => {
	it('reads each cell and each arrow as a statement, in written order', () => {
		expect(pic(SRC).env).toBe('tikzcd');
		expect(kinds(SRC)).toEqual([
			'cell:A',
			'arrow:\\arrow[r, "f"]',
			`arrow:\\arrow[d, "g"']`,
			'cell:B',
			'arrow:\\arrow[d, hook]',
			'cell:C',
			'arrow:\\arrow[r, dashed, bend left]',
			'cell:D'
		]);
	});

	it('marks each cell, each arrow as it is drawn, and every cell of the grid at the end', () => {
		const sent = instrumentPicture(SRC, pic(SRC));
		expect(sent).toContain('\\begin{tikzcd}[execute at end picture={\\tikzcapslot{1}{1}{-1001}');
		expect(sent).toContain('\\tikzcapslot{2}{2}{-2002}\\tikzcapmark{0}}]');
		expect(sent).toContain('\\tikzcapmark{1}A \\arrow[execute at begin to={\\tikzcapmark{2}}, r, "f"]');
	});

	it('reads and writes an arrow: its label and side, head, line and bend', () => {
		const g = arrowAt(SRC, arrow(SRC, 1).from)!;
		expect(readArrow(g)).toEqual({ label: 'g', side: 'right', head: 'to', line: 'solid', bend: 'none' });
		expect(readArrow(arrowAt(SRC, arrow(SRC, 3).from)!)).toMatchObject({ line: 'dashed', bend: 'left' });
		const next = writeArrowItems(SRC, g.from, arrowItems(g, { side: 'on', head: 'two heads', bend: 'right' }))!;
		expect(next).toContain('\\arrow[d, "g" description, two heads, bend right]');
		const h = arrowAt(SRC, arrow(SRC, 2).from)!;
		expect(writeArrowItems(SRC, h.from, arrowItems(h, { head: 'to', label: 'i' }))).toContain('\\arrow[d, "i"]');
	});
});

describe('editing a diagram', () => {
	it('adds a cell inside the grid, past its edges, and in a new row or column', () => {
		expect(addCell(SRC, pic(SRC).from, 2, 3, 'E').source).toContain('C \\arrow[r, dashed, bend left] & D & E\n');
		expect(addCell(SRC, pic(SRC).from, 3, 2, 'E').source).toContain('& D \\\\\n  & E\n\\end{tikzcd}');
		expect(addCell(SRC, pic(SRC).from, 0, 1, 'Z').source).toContain('\\begin{tikzcd}\n  Z \\\\\n  A \\arrow');
		const left = addCell(SRC, pic(SRC).from, 1, 0, 'Z').source;
		expect(left).toContain('  Z & A \\arrow[r, "f"]');
		expect(left).toContain('  & C \\arrow');
	});

	it('moves a cell, its arrows and the arrows to it still meeting the same cells', () => {
		// B from row 1 column 2 to row 1 column 3: A's arrow reaches further, and B's own still points at D
		const moved = moveCell(SRC, pic(SRC).from, cell(SRC, 'B').from, 1, 3)!;
		expect(moved.source).toContain('A \\arrow[rr, "f"] \\arrow[d, "g"\'] & & B \\arrow[dl, hook] \\\\');
		expect(moved.source.slice(moved.at, moved.at + 1)).toBe('B');
		expect(moveCell(SRC, pic(SRC).from, cell(SRC, 'B').from, 2, 2)).toBeNull();
	});

	it('adds an arrow from one cell to another, and takes out a cell with every arrow it meets', () => {
		const added = addArrow(SRC, pic(SRC).from, cell(SRC, 'C').from, cell(SRC, 'B').from)!;
		expect(added.source).toContain('C \\arrow[r, dashed, bend left] \\arrow[ur] & D');
		const removed = removeCell(SRC, cell(SRC, 'B').from);
		expect(removed).toContain('A \\arrow[d, "g"\'] & \\\\');
	});

	it('points an arrow at another cell, and starts it from one, written in the cell it now leaves', () => {
		const f = arrow(SRC, 0).from;
		expect(pointArrow(SRC, f, 1, cell(SRC, 'D').from)!.source).toContain('A \\arrow[dr, "f"]');
		const moved = pointArrow(SRC, f, 0, cell(SRC, 'C').from)!;
		expect(moved.source).toContain('A \\arrow[d, "g"\'] & B');
		expect(moved.source).toContain('C \\arrow[r, dashed, bend left] \\arrow[ur, "f"] & D');
		expect(moved.source.slice(moved.at)).toMatch(/^\\arrow\[ur/);
		expect(pointArrow(SRC, f, 0, cell(SRC, 'B').from)).toBeNull();
	});
});

describe('a diagram written with ampersand replacement', () => {
	it('reads its cells and adds a column with its own separator', () => {
		const s = String.raw`\begin{document}
\begin{tikzcd}[ampersand replacement=\&]
  A \arrow[r] \& B
\end{tikzcd}
\end{document}`;
		expect(kinds(s)).toEqual(['cell:A', 'arrow:\\arrow[r]', 'cell:B']);
		expect(addCell(s, s.indexOf('\\begin{tikzcd}'), 1, 3, 'C').source).toContain('A \\arrow[r] \\& B \\& C');
	});
});
