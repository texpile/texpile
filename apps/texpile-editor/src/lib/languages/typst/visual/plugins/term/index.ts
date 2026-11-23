import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { termViews } from './canvas/termViews';
import { termDocument } from './document';
import { termInserts } from './termInsert';
import { termKeys } from './termKeys';

export const term: TypstPlugin = {
	document: termDocument,
	canvasViews: termViews,
	insert: termInserts,
	editorPlugins: { atStart: termKeys }
};
