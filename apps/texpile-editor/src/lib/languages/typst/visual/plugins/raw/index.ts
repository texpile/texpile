import { CodeBlockView, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { rawDocument } from './document';
import { rawInserts } from './rawInsert';

export const raw: TypstPlugin = {
	document: rawDocument,
	views: () => ({ code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos as () => number) }),
	insert: rawInserts
};
