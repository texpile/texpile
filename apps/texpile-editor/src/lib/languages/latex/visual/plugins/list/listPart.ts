import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { bodyOf, destroyParts, type ChipFace, type LatexFaceCore } from '$lib/languages/latex/visual/core';
import type { SyntaxNode } from '@lezer/common';
import { listEnvironmentFace, type ListItemParts } from './listEnvironmentFace';
import { listItemsIn } from './listItems';

export function listPart(name: string, node: SyntaxNode, core: LatexFaceCore): ChipFace | null {
	const found = listItemsIn(core.unitsOf(bodyOf(node)), commonEnvFacts(name).item ?? [], (group) => core.unitsOf(bodyOf(group)));
	if (!found) return null;
	const items: ListItemParts[] = [];
	for (const { call, body } of found) {
		const labelArg = call.args.find((a) => a.present && a.open === '[');
		const label = labelArg ? core.drawRun(labelArg) : null;
		const drawn = core.drawUnits(body);
		if ((labelArg && !label) || !drawn) {
			destroyParts(label, drawn, ...items.flatMap((item) => [item.label, item.body]));
			return null;
		}
		items.push({ label, body: drawn });
	}
	return listEnvironmentFace(name, items, core.src.slice(node.from, node.to));
}
