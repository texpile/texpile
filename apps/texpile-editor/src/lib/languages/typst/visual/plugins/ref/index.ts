import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { refDocument } from './document';
import { refNumbersPlugin } from './node/refNumbers.svelte';
import { TypstRefView } from './node/typstRefView.svelte';

export const ref: TypstPlugin = {
	document: refDocument,
	views: (setup) => ({ typ_ref: (node, view, getPos) => new TypstRefView(node, view, getPos, setup.parse) }),
	editorPlugins: { atStart: () => [refNumbersPlugin] }
};
