import { footnoteFace, mandatoryArgs, readableText, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { readFootnote } from './footnoteCommand';
import FootnoteSettings from './FootnoteSettings.svelte';

export const footnote: LatexPlugin = {
	commands: ['footnote', 'footnotemark', 'footnotetext'],
	counts: { footnote: (call) => (call.name === 'footnotetext' ? [] : [call.given]) },
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const counted = part.name === 'footnotetext' ? null : core.nextFootnote();
		return footnoteFace(counted, core.optional(part.call), readableText(core.text(mandatoryArgs(part.call)[0])));
	},
	settings: (source) => (readFootnote(source) ? FootnoteSettings : null)
};
