import { faceElement, setLook, type StyleLook } from '$lib/editor/canvas';
import {
	type ChipFace,
	type TypstDrawer,
	typstSidesCss,
	columnsCss,
	horizontalAlignment,
	strokeCss,
	namedArg,
	type CallArg,
	destroyDrawings
} from '$lib/languages/typst/visual/core';
import { readTable, type TableRead } from './tableCall';
import { placeTable, type TableLine } from './tableGrid';

const DEFAULT_STROKE = '1px solid currentColor';
const DEFAULT_INSET = '0.3em 0.5em';

function lineBorder(line: TableLine): string {
	const stroke = namedArg(line.call, 'stroke');
	return (stroke && strokeCss(line.call, stroke)) || DEFAULT_STROKE;
}

function cellStroke(read: TableRead): string | null {
	if (read.auto) return null;
	const stroke = namedArg(read.call, 'stroke');
	if (!stroke) return DEFAULT_STROKE;
	return stroke.kind === 'None' ? null : (strokeCss(read.call, stroke) ?? DEFAULT_STROKE);
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
	const grid = read && placeTable(read, drawer);
	if (!read || !grid) return null;
	const { call, cols } = read;
	const dom = faceElement('div', 'drawn-typst-table');
	const columns = namedArg(call, 'columns');
	const tracks = columnsCss(call, columns);
	const stroke = cellStroke(read);
	setLook(dom, {
		display: 'grid',
		width: tracks?.includes('fr') ? '100%' : 'fit-content',
		maxWidth: '100%',
		margin: '0.5em 0',
		...(tracks ? { gridTemplateColumns: tracks } : {}),
		...(stroke ? { borderTop: stroke, borderLeft: stroke } : {})
	});
	const align = namedArg(call, 'align');
	const whole = align && align.kind !== 'Array' ? horizontalAlignment(align.value) : null;
	const perColumn = columnAlignments(align);
	const inset = namedArg(call, 'inset');
	const padding = inset ? typstSidesCss(inset.node, call.source) : null;
	for (const cell of grid.cells) {
		const box = faceElement('div', 'drawn-typst-cell');
		const side = perColumn ? perColumn[cell.col] : whole;
		const look: { -readonly [K in keyof StyleLook]: StyleLook[K] } = {
			minWidth: '0',
			gridColumn: `${cell.col + 1} / span ${Math.min(cell.colspan, cols - cell.col)}`,
			gridRow: `${cell.row + 1} / span ${cell.rowspan}`,
			padding: padding ?? DEFAULT_INSET,
			...(stroke ? { borderRight: stroke, borderBottom: stroke } : {}),
			...(side ? { textAlign: side } : {})
		};
		for (const line of grid.hlines) {
			if (line.at === cell.row) look.borderTop = lineBorder(line);
			if (line.at === grid.rows && cell.row + cell.rowspan === grid.rows) look.borderBottom = lineBorder(line);
		}
		for (const line of grid.vlines) {
			if (line.at === cell.col) look.borderLeft = lineBorder(line);
			if (line.at === cols && cell.col + cell.colspan === cols) look.borderRight = lineBorder(line);
		}
		setLook(box, look);
		box.append(cell.drawing.dom);
		dom.append(box);
	}
	const drawings = grid.cells.map((cell) => cell.drawing);
	dom.hint = read.source;
	return {
		dom,
		line: true,
		decorate: (decorations) => drawings.forEach((drawn) => drawn.faces.forEach((face) => face.decorate?.(decorations))),
		destroy: () => destroyDrawings(drawings)
	};
}
