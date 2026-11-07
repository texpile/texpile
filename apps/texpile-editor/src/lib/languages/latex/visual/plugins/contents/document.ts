import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';

const BLOCKS = new Set(['tableofcontents', 'listoffigures', 'listoftables']);

export const contentsDocument: LatexDocumentPlugin = { import: { blocks: (name) => BLOCKS.has(name) } };
