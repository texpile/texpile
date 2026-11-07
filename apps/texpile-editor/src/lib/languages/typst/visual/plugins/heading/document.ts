import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { headingCallSeg, headingMarkup } from './headingImport';
import { headingSchema } from './headingSchema';
import { headingLine, headingSave, headingStringBody } from './headingSave';

export const headingDocument: TypstDocumentPlugin = {
	import: { calls: { blocks: { heading: headingCallSeg } }, markup: { blocks: { Heading: headingMarkup } } },
	schema: headingSchema,
	save: {
		nodes: { heading: headingSave },
		ownLines: (node, core) => node.type.name === 'heading' && headingLine(node, core) != null,
		stringBody: headingStringBody
	}
};
