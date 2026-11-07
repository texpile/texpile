import { imageOf, type LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';

export const graphicDocument: LatexDocumentPlugin = {
	import: { blocks: (name) => name === 'includegraphics', commands: { includegraphics: imageOf } }
};
