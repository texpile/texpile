import { IncludeDocView, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { includeDocument } from './document';

export const include: LatexPlugin = {
	document: includeDocument,
	views: (setup) => ({ includedoc: (node, view, getPos) => new IncludeDocView(node, view, getPos as () => number, setup.imageDir) })
};
