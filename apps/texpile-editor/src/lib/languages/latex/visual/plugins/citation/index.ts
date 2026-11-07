import { citationFaceCommands, citeFormOf } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { mandatoryArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { citeCallFace } from './citeCallFace';
import { citeGroupsOf } from './citeGroups';
import { nociteFace } from './nociteFace';
import { citationDocument } from './document';
import { CitationView } from './node/citationView.svelte';

function drawsAsCitation(name: string): boolean {
	return citationFaceCommands().has(name) || citeFormOf(name) === 'nocite';
}

function citesInFootnote(name: string): boolean {
	return citeFormOf(name) === 'foot' && !name.endsWith('text') && !name.endsWith('texts');
}

export const citation: LatexPlugin = {
	role: { commands: (name) => drawsAsCitation(name) || citeFormOf(name) === 'foot' },
	opensChip: drawsAsCitation,
	counts: { footnote: (call) => (citesInFootnote(call.name) ? [null] : []) },
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const { call, name } = part;
		const args = mandatoryArgs(call);
		if (
			citationFaceCommands().has(name) &&
			args.length &&
			!call.args.some((a) => a.present && a.kind.startsWith('d') && a.kind !== 'd()')
		) {
			const groups = citeGroupsOf(call, core.src);
			if (groups) return citeCallFace(name, groups, core.source, core.nextFootnote);
		}
		if (citeFormOf(name) === 'nocite' && args.length) return nociteFace(core.text(args[0]), core.source);
		return undefined;
	},
	document: citationDocument,
	views: () => ({ citation: (node, view, getPos) => new CitationView(node, view, getPos as () => number) })
};
