import {
	argTextContent,
	mandatoryArgs,
	type ImportCall,
	type LatexDocumentPlugin,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

function include(im: TreeImport, call: ImportCall): PmNode[] | null {
	const path = argTextContent(im, mandatoryArgs(call)[0]).trim();
	return path ? [im.core.node('includedoc', { path, command: call.name })] : null;
}

export const includeDocument: LatexDocumentPlugin = {
	import: {
		blocks: (name) => name === 'input' || name === 'include' || name === 'subfile',
		commands: { input: include, include, subfile: include }
	},
	// emit the exact include command captured at parse time, path verbatim
	save: { nodes: { includedoc: (node) => `\\${String(node.attrs.command ?? 'input')}{${String(node.attrs.path ?? '')}}\n` } }
};
