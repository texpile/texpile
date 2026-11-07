import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';

const BLOCKS = new Set(['newpage', 'clearpage', 'pagebreak']);

export const pageBreakDocument: LatexDocumentPlugin = { import: { blocks: (name) => BLOCKS.has(name) } };
