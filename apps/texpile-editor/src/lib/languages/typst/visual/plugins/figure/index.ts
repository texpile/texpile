import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { figureDocument } from './document';
import { typstFigureViews } from './typstFigureCanvasView';

export const figure: TypstPlugin = {
	document: figureDocument,
	canvasViews: typstFigureViews
};
