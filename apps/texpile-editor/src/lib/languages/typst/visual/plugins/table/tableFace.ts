import {
	tip,
	faceElement,
	type ChipFace,
	type TypstDrawer,
	typstSidesCss,
	columnsCss,
	horizontalAlignment,
	strokeCss,
	namedArg,
	type CallArg,
	type StdUse,
	destroyDrawings
} from '$lib/languages/typst/visual/core';
import { readTable } from './tableCall';
import { placeTable, type TableLine } from './tableGrid';
import './tableFace.css';

const DEFAULT_STROKE = '1px solid currentColor';
const DEFAULT_INSET = '0.3em 0.5em';

function lineBorder(use: StdUse, line: TableLine): string {
	const stroke = namedArg(line.call, 'stroke');
	return (stroke && strokeCss(line.call, stroke)) || DEFAULT_STROKE;
}

function cellStroke(use: StdUse): string | null {
	const stroke = namedArg(use.call, 'stroke');
	if (!stroke) return DEFAULT_STROKE;
	return stroke.kind === 'None' ? null : (strokeCss(use.call, stroke) ?? DEFAULT_STROKE);
}

function columnAlignments(align: CallArg | null): string[] | null {
	if (align?.kind !== 'Array') return null;
	const out: string[] = [];
	for (let c = align.node.firstChild; c; c = c.nextSibling) {
		if (['Space', 'Comma', 'LeftParen', 'RightParen'].includes(c.name)) continue;
		out.push(horizontalAlignment(align.value.slice(c.from - align.node.from, c.to - align.node.from)) ?? '');
	}
	return out;
}

export function tableFace(source: string, drawer: TypstDrawer): ChipFace | null {
	const read = readTable(source);
	const grid = read && placeTable(read.use.call, read.use.entry, read.cols, drawer);
	if (!read || !grid) return null;
	const { use, cols } = read;
	const { call } = use;
	const dom = faceElement('div', 'drawn-typst-table');
	const columns = namedArg(call, 'columns');
	const tracks = columnsCss(call, columns);
	if (tracks) dom.style.gridTemplateColumns = tracks;
	if (tracks?.includes('fr')) dom.style.width = '100%';
	const stroke = cellStroke(use);
	if (stroke) {
		dom.style.setProperty('--typ-stroke', stroke);
		dom.dataset.stroke = '';
	}
	const align = namedArg(call, 'align');
	const whole = align && align.kind !== 'Array' ? horizontalAlignment(align.value) : null;
	const perColumn = columnAlignments(align);
	const inset = namedArg(call, 'inset');
	const padding = inset ? typstSidesCss(inset.node, call.source) : null;
	for (const cell of grid.cells) {
		const box = faceElement('div', 'drawn-typst-cell');
		box.style.gridColumn = `${cell.col + 1} / span ${Math.min(cell.colspan, cols - cell.col)}`;
		box.style.gridRow = `${cell.row + 1} / span ${cell.rowspan}`;
		box.style.padding = padding ?? DEFAULT_INSET;
		const side = perColumn ? perColumn[cell.col] : whole;
		if (side) box.style.textAlign = side;
		for (const line of grid.hlines) {
			if (line.at === cell.row) box.style.borderTop = lineBorder(use, line);
			if (line.at === grid.rows && cell.row + cell.rowspan === grid.rows) box.style.borderBottom = lineBorder(use, line);
		}
		for (const line of grid.vlines) {
			if (line.at === cell.col) box.style.borderLeft = lineBorder(use, line);
			if (line.at === cols && cell.col + cell.colspan === cols) box.style.borderRight = lineBorder(use, line);
		}
		box.append(cell.drawing.dom);
		dom.append(box);
	}
	const drawings = grid.cells.map((cell) => cell.drawing);
	const tipped = tip(dom, use.source);
	return {
		dom,
		line: true,
		decorate: (decorations) => drawings.forEach((drawn) => drawn.faces.forEach((face) => face.decorate?.(decorations))),
		destroy() {
			destroyDrawings(drawings);
			tipped.destroy();
		}
	};
}
