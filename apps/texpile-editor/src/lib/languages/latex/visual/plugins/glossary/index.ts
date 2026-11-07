import { definesGlossaryEntries, glossaryUse } from '$lib/languages/latex/knowledge/commands/glossaryUse';
import { mandatoryArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { acronymListFace } from './acronymListFace';
import { glossaryFace } from './glossaryFace.svelte';

export const glossary: LatexPlugin = {
	role: { commands: (name) => glossaryUse(name) !== null, environments: definesGlossaryEntries },
	opensChip: (_name, kind) => kind === 'commands',
	face(part, core) {
		if (part.kind === 'whole') return acronymListFace(part.source);
		if (part.kind !== 'command') return undefined;
		const use = glossaryUse(part.name);
		const key = mandatoryArgs(part.call)[0];
		if (!use || !key) return undefined;
		const inserted = part.call.args.find((a) => a.present && a.open === '[' && a.from > key.from);
		return glossaryFace(use, core.text(key).trim(), inserted ? core.text(inserted) : '', core.source);
	}
};
