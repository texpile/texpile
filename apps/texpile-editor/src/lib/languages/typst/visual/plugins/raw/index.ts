import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { rawDocument } from './document';
import { rawInserts } from './rawInsert';

export const raw: TypstPlugin = {
	document: rawDocument,
	insert: rawInserts
};
