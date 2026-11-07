import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { figureDocument } from './document';
import { typstFigureView } from './typstFigureView';

export const figure: TypstPlugin = { document: figureDocument, views: () => ({ typ_figure: (node) => typstFigureView(node) }) };
