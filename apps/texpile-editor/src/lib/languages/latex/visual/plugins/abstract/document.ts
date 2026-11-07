import type { Node } from 'prosemirror-model';
import {
	firstBraced,
	type ConversionContext,
	type ImportCall,
	type LatexDocumentPlugin,
	type LatexSaveCore,
	type PmNode,
	type TreeEnvironment,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';
import { abstractNodes } from './abstractSchema';

function abstractEnvironment(im: TreeImport, env: TreeEnvironment): PmNode[] {
	return [im.core.node('abstract', { sourceForm: 'env' }, im.core.blocks(env.body))];
}

function abstractCommand(im: TreeImport, call: ImportCall, ctx: ConversionContext): PmNode[] {
	const arg = firstBraced(call);
	return [
		im.core.node('abstract', { sourceForm: 'macro' }, [im.core.node('paragraph', null, arg?.body ? im.core.inline(arg.body, ctx) : [])])
	];
}

function abstractLatex(node: Node, _ctx: unknown, core: LatexSaveCore): string {
	const sourceForm = String(node.attrs.sourceForm ?? 'env');
	if (sourceForm === 'macro' && node.childCount === 1 && node.firstChild?.type.name === 'paragraph') {
		return `\\abstract{${core.children(node.firstChild, false).trimEnd()}}\n`;
	}
	return `\\begin{abstract}\n${core.body(node)}\\end{abstract}\n`;
}

export const abstractDocument: LatexDocumentPlugin = {
	import: {
		blocks: (name) => name === 'abstract',
		commands: { abstract: abstractCommand },
		environments: { abstract: abstractEnvironment }
	},
	schema: ({ nodes, marks }) => ({ nodes: nodes.addBefore('environment', 'abstract', abstractNodes.abstract), marks }),
	save: { endsParagraph: ['abstract'], nodes: { abstract: abstractLatex } }
};
