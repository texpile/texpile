import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { headingDocument } from './document';
import { headingInserts } from './headingInsert';

export const heading: TypstPlugin = { document: headingDocument, insert: headingInserts };
