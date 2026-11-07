import { citationCommands } from '$lib/languages/latex/knowledge/calls/citeCommands';
import type { LatexCommandImport, LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { citationLatex, createCitation } from './node/citationNode';
import { citationNodeSpec } from './node/citationSchema';

export const citationDocument: LatexDocumentPlugin = {
	import: { commands: Object.fromEntries([...citationCommands()].map((name): [string, LatexCommandImport] => [name, createCitation])) },
	schema: ({ nodes, marks }) => ({ nodes: nodes.addToEnd('citation', citationNodeSpec), marks }),
	save: { nodes: { citation: citationLatex } }
};
