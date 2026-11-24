import type { FaceElement } from '$lib/editor/canvas';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { definitionBody, definitionsFace, type DefinitionLine } from '$lib/editor/visual/extensions/drawnChips/definitions/definitionsFace';
import { formulaFace } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { appendTo } from '$lib/editor/visual/extensions/drawnChips/faces/partElements';
import { chipElement } from '$lib/editor/visual/extensions/drawnChips/looks/chipLooks';
import { bodyIsMath } from './bodyIsMath';
import type { ReadDefinition } from './readDefinition';
import { oneLine } from './texSource';

export type TextDrawer = (latex: string) => ChipFace | null;

function bodyCell(definition: ReadDefinition, drawText: TextDrawer, drawn: ChipFace[]): FaceElement {
	if (definition.body === null) {
		return definitionBody(null, `\\${definition.command}`, drawn, true);
	}
	const body = definition.body.trim();
	if (!definition.code && body && (definition.math || bodyIsMath(body))) {
		// a parameter left as #1 typesets as an empty slot
		return appendTo(
			chipElement('span', 'drawn-definition-body'),
			formulaFace(body.replace(/(^|[^\\#])#([1-9])/g, '$1\\mathrm{\\#$2}'), false)
		);
	}
	return definitionBody(definition.code || !body ? null : drawText(body), oneLine(body) || '{}', drawn);
}

export function texDefinitionsFace(definitions: ReadDefinition[], source: string, drawText: TextDrawer): ChipFace {
	const drawn: ChipFace[] = [];
	const lines: DefinitionLine[] = definitions.map((definition) => ({
		name: definition.name,
		params: definition.params,
		sign: definition.body === null ? '' : ':=',
		body: bodyCell(definition, drawText, drawn)
	}));
	return definitionsFace(lines, source, drawn);
}
