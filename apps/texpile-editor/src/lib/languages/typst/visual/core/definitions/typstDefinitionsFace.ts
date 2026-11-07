// the paper's own Typst definitions as the shared rows LaTeX draws its \newcommand lines in
import { faceElement, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { definitionBody, definitionsFace } from '$lib/editor/visual/extensions/drawnChips/definitions/definitionsFace';
import { strValue, textOf } from '../../../knowledge/scan/syntax';
import type { TypstDrawer } from '../plugin/typstPlugin';
import { oneLine, type DefinitionRow } from './definitionRows';

function bodyCell(row: DefinitionRow, drawer: TypstDrawer, drawn: ChipFace[]): HTMLElement {
	const { body, source } = row;
	if (row.imported !== undefined || !body) return definitionBody(null, row.imported ?? '', drawn);
	if (!row.params && body.name === 'Str') return faceElement('span', 'drawn-definition-body', strValue(body, source));
	const markup = !row.params && body.name === 'ContentBlock' ? textOf(body, source).slice(1, -1) : null;
	const drawing = markup === null ? null : drawer.drawMarkup(markup);
	const face: ChipFace | null = drawing && {
		dom: drawing.dom,
		line: drawing.block,
		destroy: () => drawing.faces.forEach((part) => part.destroy?.())
	};
	return definitionBody(face, oneLine(textOf(body, source)) || '[]', drawn);
}

export function typstDefinitionsFace(rows: DefinitionRow[], source: string, drawer: TypstDrawer): ChipFace {
	const drawn: ChipFace[] = [];
	const lines = rows.map((row) => ({
		name: row.name,
		params: row.params,
		sign: row.imported === undefined ? ':=' : ':',
		body: bodyCell(row, drawer, drawn)
	}));
	return definitionsFace(lines, source, drawn);
}
