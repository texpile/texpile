import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { refDocument } from './document';
import { refNumbersPlugin } from './node/refNumbers.svelte';
import { typstRefCanvasView } from './node/typstRefCanvasView';

export const ref: TypstPlugin = {
	document: refDocument,
	canvasViews: (setup) => ({ nodeViews: { typ_ref: typstRefCanvasView(setup.parse) } }),
	editorPlugins: { atStart: () => [refNumbersPlugin] }
};
