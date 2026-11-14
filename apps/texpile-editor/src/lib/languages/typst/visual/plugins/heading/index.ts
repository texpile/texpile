import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { headingDocument } from './document';
import { headingInserts } from './headingInsert';
import { headingLabelsPlugin } from './headingLabels';

export const heading: TypstPlugin = {
	document: headingDocument,
	insert: headingInserts,
	editorPlugins: { atStart: () => [headingLabelsPlugin] }
};
