import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import type { TreeArg, TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { titleSeparator } from './titleLines';

function readsAsText(arg: Argument | undefined): boolean {
	const roles = arg ? rolesOf(arg) : [];
	return roles.length === 0 || roles.includes('text');
}

export function titleMarkup(
	call: TreeCall,
	signature: readonly Argument[] | undefined,
	drawArgument: (arg: TreeArg) => ChipFace[] | null
): ChipFace[] | null {
	const shown = call.args.filter((arg, i) => arg.present && arg.open === '{' && readsAsText(signature?.[i]));
	if (!call.args.some((arg) => arg.present)) return [titleSeparator()];
	const parts: ChipFace[] = [];
	for (const arg of shown) {
		const drawn = drawArgument(arg);
		if (!drawn) {
			parts.forEach((part) => part.destroy?.());
			return null;
		}
		parts.push(...drawn);
	}
	return parts;
}
