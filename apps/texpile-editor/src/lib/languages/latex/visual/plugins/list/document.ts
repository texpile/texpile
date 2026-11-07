import { tableEnvFacts, type LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { listBlocks, readsAsItems } from './import/listTree';
import { listLatex } from './save/listLatex';

export const listDocument: LatexDocumentPlugin = {
	import: {
		environments: {
			itemize: (im, env) => listBlocks(im, env, 'bullet'),
			enumerate: (im, env) => listBlocks(im, env, 'ordered'),
			description: (im, env) => listBlocks(im, env, 'bullet')
		},
		roles: {
			items: (im, env) => {
				const items = tableEnvFacts(im.readings.table, env.name).item ?? [];
				return readsAsItems(im.readings.table, items) ? listBlocks(im, env, 'bullet') : null;
			}
		}
	},
	// overlay: the <specification> of a beamer item, which shows the item on some slides only
	schema: ({ nodes, marks }) => {
		const base = nodes.get('list')!;
		return { nodes: nodes.update('list', { ...base, attrs: { ...base.attrs, overlay: { default: null } } }), marks };
	},
	save: { endsParagraph: ['list'], nodes: { list: listLatex } }
};
