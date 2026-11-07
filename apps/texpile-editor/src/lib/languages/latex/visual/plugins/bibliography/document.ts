import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';

const BLOCKS = new Set(['bibliography', 'printbibliography']);

export const bibliographyDocument: LatexDocumentPlugin = { import: { blocks: (name) => BLOCKS.has(name) } };
