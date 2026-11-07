import type { Argument } from '$lib/languages/latex/knowledge/types';
import { argWhere, hasRole, labelFace, readsArg, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { labelDocument } from './document';
import { LabelView } from './node/labelView.svelte';
import { labelSpacingPlugin } from './node/labelSpacing';
function isNewLabel(a: Argument): boolean {
	return hasRole('label')(a) && a.defines === 'new';
}

export const label: LatexPlugin = {
	role: { commands: (name) => readsArg(name, isNewLabel) },
	face: (part, core) => (part.kind === 'command' ? labelFace(core.text(argWhere(part.call, isNewLabel)).trim()) : undefined),
	document: labelDocument,
	views: () => ({ label: (node, view, getPos) => new LabelView(node, view, getPos as () => number) }),
	editorPlugins: { afterContents: () => [labelSpacingPlugin()] }
};
