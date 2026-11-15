import { referencesLabel } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { mandatoryArgs, REFERENCES, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { readCrossRef } from './crossRefCommand';
import { readHyperref } from './hyperrefCommand';
import { referenceFace } from './referenceFace';
import CrossRefSettings from './settings/CrossRefSettings.svelte';
import HyperrefSettings from './settings/HyperrefSettings.svelte';
import { crossReferenceDocument } from './document';
import { RefView } from './node/refView.svelte';

export const crossReference: LatexPlugin = {
	commands: [...REFERENCES, 'texorpdfstring'],
	role: { commands: referencesLabel },
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		if (part.name === 'texorpdfstring') return core.drawRun(mandatoryArgs(part.call)[0]);
		return referenceFace(part.call, core.src, core.source);
	},
	settings(source) {
		if (readCrossRef(source)) return CrossRefSettings;
		return readHyperref(source) ? HyperrefSettings : null;
	},
	document: crossReferenceDocument,
	views: (setup) => ({ ref: (node, view, _getPos, decorations) => new RefView(node, view, decorations, setup.onJumpToLabel) })
};
