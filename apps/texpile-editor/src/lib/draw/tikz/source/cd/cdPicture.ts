import { plainStatement } from '../plainStatement';
import type { Picture, Statement } from '../picture';
import { readGrid } from './cdGrid';
import type { CdGrid } from './cdGrid.types';

// a slot's mark, numbered below zero so no statement takes it: where TeX put the cell's middle
export const SLOT_MARK = String.raw`\makeatletter\providecommand\tikzcapslot[3]{\pgfutil@ifundefined{pgf@sh@ns@\tikzcdmatrixname-#1-#2}{}{{%
\pgftransformshift{\pgfpointanchor{\tikzcdmatrixname-#1-#2}{center}}\pgfkeys{/tikz/tikzcap transform={#3}}}}}\makeatother`;
export const NEW_DIAGRAM = '\\begin{tikzcd}\n  A \\arrow[r, "f"] \\arrow[d] & B \\arrow[d, "g"] \\\\\n  C \\arrow[r] & D\n\\end{tikzcd}\n';

/** a tikz-cd diagram: each cell's text and each arrow a statement, in written order */
export function readDiagram(source: string, from: number, to: number): Picture & { grid: CdGrid } {
	const grid = readGrid(source, from, to);
	const statements: Statement[] = grid.rows
		.flat()
		.flatMap((cell) => [
			...(cell.text ? [plainStatement(cell.text.from, cell.text.to, 'cell', '', false)] : []),
			...cell.arrows.map((a) => plainStatement(a.from, a.to, 'arrow', '\\arrow', false))
		])
		.sort((a, b) => a.from - b.from)
		.map((s, k) => ({ ...s, i: k + 1 }));
	return { from, to, env: 'tikzcd', layout: 'grid', bodyFrom: grid.bodyFrom, endFrom: grid.endFrom, statements, grid };
}

export function slotMark(r: number, c: number) {
	return -(r * 1000 + c);
}
export function slotOf(mark: number) {
	return { r: Math.floor(-mark / 1000), c: -mark % 1000 };
}

/** the marks a diagram's text gets: each cell's before its text, each arrow's as it is drawn, the slots at the end */
export function diagramCuts(source: string, picture: Picture & { grid: CdGrid }, kept: Statement[]) {
	const { grid } = picture;
	const cols = Math.max(...grid.rows.map((r) => r.length));
	const slots = grid.rows.flatMap((row, r) =>
		Array.from({ length: cols }, (_, c) => `\\tikzcapslot{${r + 1}}{${c + 1}}{${slotMark(r + 1, c + 1)}}`)
	);
	const end = `execute at end picture={${slots.join('')}\\tikzcapmark{0}}`;
	const options = grid.options
		? { at: grid.options.from + 1, text: source.slice(grid.options.from + 1, grid.options.to - 1).trim() ? `${end}, ` : end }
		: { at: grid.bodyFrom, text: `[${end}]` };
	const arrows = new Map(grid.rows.flat().flatMap((c) => c.arrows.map((a) => [a.from, a])));
	return [
		options,
		...kept.map((s) => {
			if (s.kind === 'cell') return { at: s.from, text: `\\tikzcapmark{${s.i}}` };
			const a = arrows.get(s.from)!;
			return { at: a.options.from, text: `execute at begin to={\\tikzcapmark{${s.i}}}${a.items.length ? ', ' : ''}` };
		})
	];
}
