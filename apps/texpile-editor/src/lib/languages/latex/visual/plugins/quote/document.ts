import type { Node } from 'prosemirror-model';
import type { LatexDocumentPlugin, LatexSaveCore, PmNode, TreeEnvironment, TreeImport } from '$lib/languages/latex/visual/core/document';

function quote(im: TreeImport, env: TreeEnvironment): PmNode[] {
	return [im.core.node('blockquote', null, im.core.blocks(env.body))];
}

function quotation(im: TreeImport, env: TreeEnvironment): PmNode[] {
	return [im.core.node('blockquote', { env: 'quotation' }, im.core.blocks(env.body))];
}

function blockquoteLatex(node: Node, _ctx: unknown, core: LatexSaveCore): string {
	const env = node.attrs.env === 'quotation' ? 'quotation' : 'quote';
	return `\\begin{${env}}\n${core.body(node)}\\end{${env}}\n`;
}

export const quoteDocument: LatexDocumentPlugin = {
	import: { environments: { quote, quotation } },
	save: { nodes: { blockquote: blockquoteLatex } }
};
