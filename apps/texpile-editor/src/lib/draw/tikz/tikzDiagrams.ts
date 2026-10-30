import type { DiagramGrid, FigureLanguage } from '$lib/draw/editor/figure/figureLanguage';
import { arrowItems, readArrow } from './source/cd/cdArrows';
import { addArrow, addCell, arrowAt, moveCell, pointArrow, removeArrow, removeCell, writeArrowItems } from './source/cd/cdEdits';
import { removeBranch } from './source/forest/forestEdits';
import { readPicture, type Picture, type Statement } from './source/picture';
import { arrowTarget, cellAt } from './source/cd/cdGrid';
import type { CdGrid } from './source/cd/cdGrid.types';

type DiagramMethods = Pick<FigureLanguage, 'readGrid' | 'addCell' | 'moveCell' | 'readArrow' | 'writeArrow' | 'arrowCells' | 'pointArrow'>;

function gridOf(picture: unknown) {
	return (picture as Picture & { grid?: CdGrid }).grid ?? null;
}

export const tikzDiagrams: DiagramMethods = {
	readGrid(_source, picture): DiagramGrid | null {
		const grid = gridOf(picture);
		if (!grid) return null;
		const byText = new Map(picture.statements.filter((s) => s.kind === 'cell').map((s) => [s.from, s.i]));
		const cells = grid.rows.flat().flatMap((c) => (c.text ? [{ r: c.r, c: c.c, cell: byText.get(c.text.from)! }] : []));
		return { rows: grid.rows.length, cols: Math.max(...grid.rows.map((r) => r.length)), cells };
	},
	addCell(source, pictureIndex, r, c, text) {
		const picture = readPicture(source, pictureIndex);
		return picture && gridOf(picture) ? addCell(source, picture.from, r, c, text) : null;
	},
	moveCell(source, pictureIndex, i, r, c) {
		const picture = readPicture(source, pictureIndex);
		const st = picture?.statements.find((s) => s.i === i);
		return picture && st?.kind === 'cell' ? moveCell(source, picture.from, st.from, r, c) : null;
	},
	readArrow(source, st) {
		const a = st.kind === 'arrow' ? arrowAt(source, st.from) : null;
		return a ? readArrow(a) : null;
	},
	writeArrow(source, st, change) {
		const a = st.kind === 'arrow' ? arrowAt(source, st.from) : null;
		return a ? writeArrowItems(source, a.from, arrowItems(a, change)) : null;
	},
	arrowCells(picture, st) {
		const grid = gridOf(picture);
		const own = grid?.rows.flat().find((c) => c.arrows.some((a) => a.from === st.from));
		const arrow = own?.arrows.find((a) => a.from === st.from);
		if (!grid || !own?.text || !arrow) return null;
		function cellOf(from: number | undefined) {
			return picture.statements.find((s) => s.kind === 'cell' && s.from === from)?.i ?? null;
		}
		const target = arrowTarget(grid, own, arrow);
		return [cellOf(own.text.from)!, cellOf(target ? cellAt(grid, target.r, target.c)?.text?.from : undefined)];
	},
	pointArrow(source, pictureIndex, i, k, cell) {
		const picture = readPicture(source, pictureIndex);
		const [arrow, onto] = [i, cell].map((n) => picture?.statements.find((s) => s.i === n));
		return arrow?.kind === 'arrow' && onto?.kind === 'cell' ? pointArrow(source, arrow.from, k, onto.from) : null;
	}
};

/** a diagram's statements go as a diagram's do: a cell with the arrows it meets, a branch with its children */
export function removeDiagramStatement(source: string, st: Statement) {
	if (st.kind === 'branch') return removeBranch(source, st.from);
	return st.kind === 'cell' ? removeCell(source, st.from) : removeArrow(source, st.from);
}

/** an arrow drawn from one cell to another, in the diagram at `pictureIndex` */
export function diagramArrow(source: string, pictureIndex: number, from: number, to: number) {
	const picture = readPicture(source, pictureIndex);
	const [a, b] = [from, to].map((i) => picture?.statements.find((s) => s.i === i));
	if (!picture || a?.kind !== 'cell' || b?.kind !== 'cell') return null;
	return addArrow(source, picture.from, a.from, b.from)?.source ?? null;
}
