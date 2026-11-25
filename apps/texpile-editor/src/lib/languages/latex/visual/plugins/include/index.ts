import { includeDocCanvasView, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { includeDocument } from './document';

export const include: LatexPlugin = {
	document: includeDocument,
	canvasViews: (setup) => ({ nodeViews: { includedoc: includeDocCanvasView(setup.imageDir) } })
};
