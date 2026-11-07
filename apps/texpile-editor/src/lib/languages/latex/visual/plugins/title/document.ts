import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';

const BLOCKS = new Set(['maketitle', 'title', 'author', 'date']);

export const titleDocument: LatexDocumentPlugin = { import: { blocks: (name) => BLOCKS.has(name) } };
