import { dividerFace, mandatoryArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { readBibliography } from './bibliographyCommand';
import BibliographySettings from './BibliographySettings.svelte';
import { bibliographyDocument } from './document';
import { bibliographyPlugin } from './bibliographyPlugin';

export const bibliography: LatexPlugin = {
	commands: ['bibliography', 'bibliographystyle'],
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const value = core.text(mandatoryArgs(part.call)[0]);
		return dividerFace(part.name === 'bibliography' ? `Bibliography - ${value}` : `Bibliography style - ${value}`, core.source);
	},
	settings: (source) => (readBibliography(source) ? BibliographySettings : null),
	document: bibliographyDocument,
	editorPlugins: { beforeWordCount: () => [bibliographyPlugin()] }
};
