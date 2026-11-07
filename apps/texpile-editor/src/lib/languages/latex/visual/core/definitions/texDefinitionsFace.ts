// LaTeX definitions as the shared rows, the body drawn as math or text when it is one
import { faceElement, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { definitionBody, definitionsFace, type DefinitionLine } from '$lib/editor/visual/extensions/drawnChips/definitions/definitionsFace';
import { renderStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { bodyIsMath } from './bodyIsMath';
import type { ReadDefinition } from './readDefinition';
import { oneLine } from './texSource';

/** draws LaTeX as the chip draws its own text, or null when it cannot */
export type TextDrawer = (latex: string) => ChipFace | null;

function bodyCell(definition: ReadDefinition, drawText: TextDrawer, drawn: ChipFace[]): HTMLElement {
	// a name made empty says what made it
	if (definition.body === null) {
		const made = definitionBody(null, `\\${definition.command}`, drawn);
		made.classList.add('drawn-definition-made');
		return made;
	}
	const body = definition.body.trim();
	if (!definition.code && body && (definition.math || bodyIsMath(body))) {
		const el = faceElement('span', 'drawn-definition-body');
		// a parameter left as #1 typesets as an empty slot
		el.appendChild(renderStaticMath(body.replace(/(^|[^\\#])#([1-9])/g, '$1\\mathrm{\\#$2}'), false));
		return el;
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
