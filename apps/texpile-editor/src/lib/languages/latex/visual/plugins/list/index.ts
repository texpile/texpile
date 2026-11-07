import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { listNumbersPlugin, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { listPart } from './listPart';
import { listDocument } from './document';
import { enumerateLabels } from './enumerateLabels';
import { listInserts } from './listInsert';

export const list: LatexPlugin = {
	role: { environments: (name) => !!commonEnvFacts(name).item?.length },
	kernel: true,
	face: (part, core) => (part.kind === 'environment' ? listPart(part.name, part.node, core) : undefined),
	document: listDocument,
	editorPlugins: { afterContents: () => [listNumbersPlugin(enumerateLabels)] },
	insert: listInserts
};
