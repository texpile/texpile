import type { LatexDocumentPlugin, PmNode, TreeEnvironment, TreeImport } from '$lib/languages/latex/visual/core/document';
import { codeBlockLatex, codeBlockOf } from './codeBlock';

function codeBlock(im: TreeImport, env: TreeEnvironment): PmNode[] {
	return [codeBlockOf(im, env)];
}

export const verbatimDocument: LatexDocumentPlugin = {
	import: { verbatimEnvironments: { verbatim: codeBlock, lstlisting: codeBlock, minted: codeBlock } },
	save: { endsParagraph: ['code_block'], nodes: { code_block: codeBlockLatex } }
};
