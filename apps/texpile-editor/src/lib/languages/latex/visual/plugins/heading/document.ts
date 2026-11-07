import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { HEADING_COMMANDS } from './headingCommand';
import { headingLatex } from './headingLatex';
import { widenHeading } from './headingSchema';

export const headingDocument: LatexDocumentPlugin = {
	import: {
		blocks: (name) => commonFacts(name).section != null,
		commands: HEADING_COMMANDS
	},
	schema: ({ nodes, marks }) => ({ nodes: nodes.update('heading', widenHeading(nodes.get('heading')!)), marks }),
	save: { nodes: { heading: headingLatex } }
};
